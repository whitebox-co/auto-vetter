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
const Sheets = require('./app/sheets');
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

const { runAction } = require('./actions');

// create instance of sheets
const sheets = new Sheets(
	process.env.GOOGLE_CLIENT_ID,
	process.env.GOOGLE_CLIENT_SECRET
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

/**
 * State of the application
 * @typedef {Object} AppState
 * @param {String} 	db 				Collection name
 * @param {String} 	sheet_id		Spreadsheed ID
 * @param {Array[]} sheet_ranges	Spreadsheet ranges used for Company and URL columns
 */
const state = {
	db: undefined,
	sheet_id: undefined,
	sheet_name: undefined,
	sheet_ranges: []
};

// log the header
console.log(boxen(
	chalk.black('Whitebox Auto Vetter'),
	{ padding: 1, backgroundColor: 'white' }
));

const alexaFn = async () => {

	Log.info("Fetching Alexa Page Rank...");
	captureBreadcrumb('Fetching Alexa Page Ranks');

	await mongo.connect();
	const docs = await mongo.find(state.db, { url: { $ne: null } });

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
			if (docs[i + j] != null)
				urls.push(docs[i + j].url);
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

			let data = response['aws:Response'];

			// set as array for single batches
			if (!_.isArray(data))
				data = [ data ];

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
					await mongo.update(state.db, { _id: docs[i + j]._id }, { $set: { alexa_rank: _.parseInt(ranks[j]) } });

		}
		catch (ex) {
			// capture the exception
			Sentry.captureException(ex);

			// set on all of the batched URLs that it failed for this batch
			for (let j = 0; j < urls.length; j++)
				mongo.update(state.db, { _id: docs[i + j] }, { $set: { error: 'Alexa Batch failed!' } });
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

// main async loop
Sentry.asyncContext(async () => {

	// return data back
	const data = await runAction('create_scrape');

	// store sheet id
	state.sheet_id = data['spreadsheetId'];
	state.sheet_name = data['sheetName'];
	// store the db name
	state.db = state.sheet_id.slice(0, 10) + state.sheet_name;
	// assumes data starts at row 2
	state.sheet_ranges = [
		`${state.sheet_name}!A2:A`,
		`${state.sheet_name}!${data['urlColumn']}2:${data['urlColumn']}`
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
	if (runOpts['choices'].includes('Facebook'))
		await runAction('getFBUrls', state);

	if (runOpts['choices'].includes('Facebook Likes'))
		await likesFn();

	if (runOpts['choices'].includes('Alexa'))
		await alexaFn();

	if (runOpts['choices'].includes('Update Spreadsheet'))
		await runAction('updateSheet', state);
	   
	Log.info("Scrape completed!");

});
