const { createAction } = require('./');
const _ = require('lodash');
const Log = require('../util/log');
const ora = require('ora');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const urlparse = require('../util/urlparse');
const chalk = require('chalk');

const FB_REGEX = /^((?:http|https):\/\/)?(?:www.)?facebook.com\/(?:(?:\w)*#!\/)?(?:pages\/)?(?:[?\w\-]*\/)?(?:profile.php\?id=(?=\d.*))?([\w\.-]*)?/;

/**
 * Scrape FB urls from a given page
 * @param {Object} param0 Object of things to pass to the function
 */
const getFBUrls = async ({ sheets, mongo, sheet_id, sheet_ranges }) => {
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
			url: urlparse(_.trim(urls[i]))
		})
	}

	// remove any of the duplicates
	rows = _.uniqWith(rows, (i, j) => {
		return i.url === j.url;
    });
    
    // create instance of puppeteer browser
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();

    // loop over documents
	for (let i = 0; i < rows.length; i++) {
		const row = rows[i].row;
		const url = rows[i].url;
		const company = companies[i];

        // create object used to insert into mongodb
		const minsert = { row, company, url };

        // URL isn't valid
		if (!_.isString(url) || _.isEmpty(url)) {
			mongo.insert(db, _.merge(minsert, { error: 'Not a valid URL' })); // NOTE: user input
			continue;
		}

        // start loading indicator
		s = ora(`Loading URL ${chalk.dim(url)} ...`).start();

		try {
            // go to the URL
            await page.goto(url);
            // parse the page for Facebook URL
            const fb = await facebookParse(page.content());
            // insert the facebook URL into the document
            if (fb != undefined)
                await mongo.insert(db, _.merge(minsert, { facebook: fb }));
            
            // complete the spinner
            s.succeed(`Done: [${i}] ${chalk.dim(url)}`);
		}
		catch (ex) {
			s.fail(`Fail: [${i}] ${url}`);
			// NOTE: user input
			mongo.insert(db, _.merge(minsert, { error: 'Failed to scrape' }));
		}
	}

	// close mongo connection
    mongo.close();
    
    Log.info('Done!');
}

/**
 * Parse HTML for facebook URLs
 * @param {String} html 
 * @returns {String|undefined} String if URL found, undefined if none found
 */
async function facebookParse(html) {
	// get instance of cheerio for this html
    const $ = cheerio.load(html);
    
    // initialize fburl return
    let fburl;

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

module.exports = createAction('getFBUrls', getFBUrls);
