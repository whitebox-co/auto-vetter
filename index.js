/**
 * Whitebox Scraper
 *
 * @author James Stine <Leon.Blade@gmail.com>
 */

// obtain environment variables from .env file
require('dotenv').config();

// require modules needed for this file
const request = require('request-promise');
const ora = require('ora');
const chalk = require('chalk');
const cheerio = require('cheerio');
const program = require('commander');
const Log = require('./util/log');
const Scrapy = require('./app/scrapy');
const Sheets = require('./app/sheets');
const Facebook = require('./app/facebook');
const sleep = require('./util/sleep');
const urlparse = require('./util/urlparse');
const fs = require('fs');
const MongoDB = require('./app/mongodb');
const _ = require('lodash');
const AlexaAPI = require('alexa');
const boxen = require('boxen');
const inquirer = require('inquirer');
const Sentry = require('./app/sentry');
const ProgressBar = require('progress');

// curry the breadcrumb function
const captureBreadcrumb = _.curry(Sentry.captureBreadcrumb)('scrape');

const FB_REGEX = /^(?:(?:http|https):\/\/)?(?:www.)?facebook.com\/(?:(?:\w)*#!\/)?(?:pages\/)?([\w\-]*)?/;

const { create_scrape } = require('./actions/scrape');

// create instance of sheets
const sheets = new Sheets(
	process.env.GOOGLE_CLIENT_ID,
	process.env.GOOGLE_CLIENT_SECRET
);

// create instance of scrapy
const scrapy = new Scrapy(
	process.env.SCRAPY_API_KEY,
	process.env.SCRAPY_PROJECT_ID,
	process.env.SCRAPY_SPIDER
);

// create instance of Facebook
const fb = new Facebook(
	process.env.FACEBOOK_CLIENT_ID,
	process.env.FACEBOOK_CLIENT_SECRET
);

// create instance of MongoDB
const mongo = new MongoDB(
	process.env.MONGO_HOST,
	process.env.MONGO_PORT,
	process.env.MONGO_DB_NAME
);

const alexa = new AlexaAPI(
	process.env.AMAZON_ACCESS_KEY,
	process.env.AMAZON_SECRET_KEY
);

//
let db = '';
let sheet_id = '';
let sheet_name = '';
let sheet_ranges = [];
let new_ranges = [];
//
//

// log the header
console.log(boxen(
	chalk.black('Whitebox Auto Vetter'),
	{ padding: 1, backgroundColor: 'white' }
));

const alexaFn = async () => {

	Log.info("Fetching Alexa Page Rank...");
	captureBreadcrumb('Fetching Alexa Page Ranks');

	await mongo.connect();
	const docs = await mongo.find(db, { url: { $ne: null } });

	// start a progress bar
	const bar = new ProgressBar(chalk.bold.green('Progress') + ' [:bar] (:current/:total)', {
		total: docs.length,
		incomplete: ' ',
		complete: chalk.bgGreen(' '),
		clear: true
	});

	// increase 5 each time for the batch
	for (let i = 0; i < docs.length; i += 5) {
		// form the urls array
		const urls = [];
		// try to get 5 at a time or cap out
		for (let j = 0; j < 5; j++) {
			if (docs[i + j] != null) {
				let url = docs[i + j].url;
				url = url.slice(0, url.indexOf('?'));
				urls.push(url);
			}
			else
				break;
		}
		captureBreadcrumb('Batching URLs', { urls });

		try {
			const response = await new Promise((resolve, reject) => {
				alexa.getURLInfo(urls, "Rank", (err, results) => {
					if (err)
						return reject(err);
					return resolve(results);
				});
			});

			const data = response['aws:Response'];

			// tick by the amount of rows from data
			bar.tick(data.length);

			// map the array into the ranks
			const ranks = _.map(data, value => {
				try {
					return value['aws:UrlInfoResult']['aws:Alexa']['aws:TrafficData']['aws:Rank'];
				}
				// catch any exceptions from blank URLs to return null
				catch (ex) {
					return null;
				}
			});

			captureBreadcrumb('Received ranks!');

			// loop over our ranks and update
			for (let j = 0; j < ranks.length; j++)
				if (typeof ranks[j] === 'string')
					await mongo.update(db, { _id: docs[i + j]._id }, { $set: { alexa_rank: _.parseInt(ranks[j]) } });

		}
		catch (ex) {
			// capture the exception
			Sentry.captureException(ex);

			// set on all of the batched URLs that it failed for this batch
			for (let j = 0; j < urls.length; j++)
				mongo.update(db, { _id: docs[i + j] }, { $set: { error: 'Alexa Batch failed!' } });
		}

		// sleep to not overload the API
		sleep(500);
	}

	Log.info('Done!');
	Log.warn(`${chalk.bold.yellow('NOTE:')} If the progress bar is still visible, press a key to update the output stream.`);
	bar.terminate();

	// close mongo connection
	mongo.close();
}

const updateFn = async () => {

	// ensure its not empty
	const validate = input => {
		return input.length > 0;
	}

	// query for columns
	const rs = await inquirer.prompt([
		{
			type: 'text',
			name: 'fburl',
			message: 'Enter the letter column for Facebook URLs',
			validate
		},
		{
			type: 'text',
			name: 'likes',
			message: 'Enter the letter column for Facebook Likes',
			validate
		},
		{
			type: 'text',
			name: 'alexa',
			message: 'Enter the letter column for Alexa Rank',
			validate
		}
	]);

	// set the new ranges
	new_ranges = [
		`${sheet_name}!${rs['fburl']}2:${rs['fburl']}`,
		`${sheet_name}!${rs['likes']}2:${rs['likes']}`,
		`${sheet_name}!${rs['alexa']}2:${rs['alexa']}`
	];

	Log.info("Updating spreadsheet...");

	await mongo.connect();
	await sheets.authenticate();

	// get all the documents
	// NOTE: user input
	const docs = await mongo.find(db);

	// ranges array for batch updat
	// NOTE: user input
	const ranges = new_ranges;
	// values arrays
	const fburls = [];
	const likes = [];
	const aranks = [];

	// get a last row index to the first in the docs
	let lastRow = docs[0].row;

	// loop over all the docs
	for (let i in docs) {
		const row = _.parseInt(docs[i].row);
		if (row - lastRow > 1) {
			for (let j = 0; j < (row - lastRow) - 1; j++) {
				fburls.push('');
				likes.push('');
				aranks.push('');
			}
		}
		fburls.push(docs[i].facebook);
		likes.push(docs[i].hasOwnProperty('likes')?docs[i].likes:'');
		aranks.push(docs[i].alexa_rank);
		lastRow = docs[i].row;
	}

	// update the sheets
	const s = ora('Updating Sheets...');
	await sheets.batchUpdate(sheet_id, ranges, [ fburls, likes, aranks ]);
	s.succeed('Done!');

	Log.info('Updated Sheets!');

	// close mongo connection
	mongo.close();
}

const likesFn = async () => {

	Log.info("Fetching Likes from Facebook URLs...");

	await mongo.connect();
	await fb.authenticate();

	// get the fbids from the mongodb
	// NOTE: user input
	const docs = await mongo.find(db, { facebook: { $ne: null } });

	// data array
	let data = [];
	// create a batch array
	let batch = [];

	// loop over the fbids
	for (let i in docs) {
		// push the fbid onto the batch stack
		batch.push({ method: 'GET', relative_url: `/v2.9/${docs[i].facebook}?fields=fan_count` });
		if (i != 0 && i % 49 == 0) {
			let s = ora('Batching 50 to FB Graph...');
			const response = await fb.batch(batch);
			if (response.error && response.error.code == 4)
				throw new Error('Facebook Graph API Rate Limit Reached!');
			// TODO: https://developers.facebook.com/docs/graph-api/using-graph-api/error-handling
			s.succeed('Done!');
			batch = [];
			data = [ ...data, ...response ];
		}
	}

	// one last batch
	if (batch.length) {
		const response = await fb.batch(batch);
		data = [ ...data, ...response ];
	}

	// loop over all the data
	for (let i in data) {
		if (data[i].error) {
			Log.error(data[i].error);
			continue;
		}
		mongo.update(db, { _id: docs[i]._id }, { $set: { likes: data[i].fan_count } });
	}

	Log.info('Done!');

	// close mongo connection
	mongo.close();
}

const killdupeFn = async () => {
	await mongo.connect();
	// NOTE: user input
	const response = await mongo.removeDuplicates(db, 'company');
	console.log(response.result);
}

const facebookFn = async () => {

	Log.info("Scraping for Facebook URLs...");

	let s = ora('Getting Sheet data...');

	// authenticate with sheets
	await sheets.authenticate();

	// connect to mongodb
	await mongo.connect();

	let data;
	try {
		data = await sheets.batchGet(sheet_id, sheet_ranges);
	}
	catch (ex) {
		Log.error(ex);
		for (let error of ex.errors)
			Log.error(error.message);
		throw ex;
	}

	// get the values from the data
	if (!data) {
		s.fail('No data!');
		throw Error('Data null');
	}

	// done with fetching sheets data
	s.succeed('Done!');


	// separate out the data
	// NOTE: user input
	const companies = data.valueRanges[0].values.shift();
	const urls = data.valueRanges[1].values.shift();

	// collection of row data
	let rows = [];

	for (let i in urls) {
		rows.push({
			row: _.parseInt(i) + 2,
			company: _.trim(companies[i]),
			url: urlparse(_.trim(urls[i]))
		})
	}

	// remove any of the duplicates
	rows = _.uniqWith(rows, (i, j) => {
		return i.url === j.url;
	});

	for (let i = 0; i < rows.length; i++) {
		// NOTE: user input
		const row = rows[i].row;
		const url = rows[i].url;
		const company = companies[i];

		const minsert = { row, company, url };

		if (!url) {
			mongo.insert(db, _.merge(minsert, { error: 'Not a valid URL' })); // NOTE: user input
			continue;
		}

		s = ora(`Loading URL ${chalk.dim(url)} ...`).start();

		try {
			const html = await request({
				url,
				followRedirect: true,
				timeout: 10 * 1000,
				headers: {
					'User-Agent': 'node.js'
				}
			});
			s.succeed(`Done! (${chalk.dim(url)}):${i}`);
			const fb = await facebookParse(html);
			await mongo.insert(db, _.merge(minsert, { facebook: fb }));
		}
		catch (ex) {
			s.fail('Oh no!');
			// NOTE: user input
			mongo.insert(db, _.merge(minsert, { error: 'Failed to scrape' }));
		}
	}

	Log.info('Done!');

	// close mongo connection
	mongo.close();
}

async function facebookParse(html) {
	let fburl = null;

	// get instance of cheerio for this html
	const $ = cheerio.load(html);

	// search for Facebook URL
	$('a').each((i, elem) => {
		const href = $(elem).attr('href')
		if (href) {
			const matches = href.match(FB_REGEX);
			if (matches && matches.length)
				fburl = matches[0].trim();
		}
	});

	return fburl;
}

const numb = n => {
	return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// main async loop
(async () => {
	// return data back
	const data = await create_scrape();

	// process the data
	// store sheet id
	sheet_id = data['spreadsheetId'];
	sheet_name = data['sheetName'];
	// store the db name
	db = sheet_id.slice(0, 10) + sheet_name;
	// assumes data starts at row 2
	sheet_ranges = [
		`${sheet_name}!A2:A`,
		`${sheet_name}!${data['urlColumn']}2:${data['urlColumn']}`
	];

	// the scrape run options
	const runOpts = await inquirer.prompt([
		{
			type: 'checkbox',
			name: 'choices',
			message: 'Pick what you want to scrape for',
			choices: [{name:'Facebook'}, {name:'Facebook Likes'}, {name:'Alexa'}, {name:'Update Spreadsheet'}]
		}
	]);

   // run the commands
   await Sentry.asyncContext(async () => {
		if (runOpts['choices'].includes('Facebook'))
			await facebookFn();
		if (runOpts['choices'].includes('Facebook Likes'))
			await likesFn();
		if (runOpts['choices'].includes('Alexa'))
			await alexaFn();
		if (runOpts['choices'].includes('Update Spreadsheet'))
			await updateFn();
	});
	   
	Log.info("Scrape completed!");

})();
