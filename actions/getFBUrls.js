const { createAction } = require('./');
const _ = require('lodash');
const Log = require('../util/log');
const ora = require('ora');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const urlparse = require('../util/urlparse');
const chalk = require('chalk');
const MongoDB = require('../app/mongodb');
const Sheets = require('../app/sheets');
const request = require('request-promise');

// regex for FB URLs
const FB_REGEX = /^(?:https?:\/\/)?(?:www\.|m\.|touch\.)?(?:facebook\.com|fb(?:\.me|\.com))\/(?!$)(?:(?:\w)*#!\/)?(?:pages\/)?(?:photo\.php\?fbid=)?(?:[\w\-]*\/)*?(?:\/)?(?:profile\.php\?id=)?([^\/?&\s]*)(?:\/|&|\?)?.*$/;

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

/**
 * Scrape FB urls from a given page
 * @param {AppState} param0 Application state object
 */
const getFBUrls = async ({ collection, sheet_id, sheet_ranges }) => {

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
	const companies = data.valueRanges[0].values.shift();
	const urls = data.valueRanges[1].values.shift();

	// collection of row data
	let rows = [];

	for (let i in urls) {
		rows.push({
			row: _.parseInt(i) + 2,
			company: _.trim(companies[i]),
			url: urls[i]
		})
	}

	// remove any of the duplicates
	rows = _.uniqWith(rows, (i, j) => {
		return i.url === j.url;
    });
    
    // create instance of puppeteer browser
    //const browser = await puppeteer.launch({ headless: true });
    //const page = await browser.newPage();
	// loop over documents
	for (let i = 0; i < rows.length; i++) {
		const row = rows[i].row;
		const url = urlparse(rows[i].url);
		const company = companies[i];

		// create object used to insert into mongodb
		const minsert = { row, company, url };

		// URL isn't valid
		if (!_.isString(url) || _.isEmpty(url)) {
			await mongo.update(
				collection,
				{ row },
				{ $set: { error: { scrape: 'Not a valid URL' } } }
			);
			continue;
		}

		// start loading indicator
		s = ora(`Loading URL ${chalk.dim(url)} ...`).start();

		try {
			// go to the URL
			//await page.goto(url);
			//const result = await page.evaluate(() => document.body.innerHTML);
			const result = await request(url.toLowerCase(), { timeout: 10000, followOriginalHttpMethod: true, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36' } });

			// parse the page for Facebook URL
			const facebook = facebookParse(result);
			// insert the facebook URL into the document
			await mongo.update(collection, { row }, { $set: { ...minsert, facebook } });
			
			// complete the spinner
			s.succeed(`Done: [${i}] ${chalk.dim(url)}`);
		}
		catch (ex) {
			s.fail(`Fail: [${i}] ${url}`);
			// NOTE: user input
			await mongo.update(
				collection,
				{ row },
				{ $set: { error: "scrape error" } }
			);
		}
	} 

	// close mongo connection
	await mongo.close();
	
	Log.info('Done!');
}

async function getFacebookURLs({ collection, rows }) {
	Log.info("Scraping for Facebook URLs (" + rows.length + ")...");
	await mongo.connect();
	let s = ora('Getting Sheet data...');
	// loop over the rows
	for (let i = 0; i < rows.length; i++) {
		const row = rows[i];
		const url = row.url;
		// start loading indicator
		s = ora(`Loading URL ${chalk.dim(url)} ...`).start();

		try {
			const result = await request(url.toLowerCase(), { timeout: 10000, followOriginalHttpMethod: true });
			// parse the page for Facebook URL
			const facebook = facebookParse(result);
			// insert the facebook URL into the document
			await mongo.update(collection, { _id: row._id }, { $set: { facebook } });
			
			// complete the spinner
			s.succeed(`Done: [${i}] ${chalk.dim(url)}`);
		}
		catch (ex) {
			s.fail(`Fail: [${i}] ${url}`);
			// NOTE: user input
			await mongo.update(
				collection,
				{ _id: row._id },
				{ $set: { error: ex.statusCode + " - " + ex.statusMessage } }
			);
		}
	}
}

/**
 * Parse HTML for facebook URLs
 * @param {String} html 
 * @returns {String|undefined} String if URL found, undefined if none found
 */
function facebookParse(html) {
	// get instance of cheerio for this html
    const $ = cheerio.load(html);
    
    // initialize fburl return
    let fburl;

	// search for Facebook URL
	$('a').each((_, elem) => {
		const href = $(elem).attr('href')
		if (href) {
			const matches = href.match(FB_REGEX);
			if (matches && matches.length)
				fburl = matches[0].trim();
		}
	});

	return fburl;
}

module.exports = { getFBUrls: createAction('getFBUrls', getFBUrls), getFacebookURLs: createAction('getFacebookURLs', getFacebookURLs) };
