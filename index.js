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

const FB_REGEX = /^(?:(?:http|https):\/\/)?(?:www.)?facebook.com\/(?:(?:\w)*#!\/)?(?:pages\/)?([\w\-]*)?/;

// set the program version
program.version('0.1.0');

// default action
program.action(() => program.help());

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

const mongo = new MongoDB();




//
// NOTE: USER FIELDS PLEASE CHANGE THANKS
const db = 'fancy_food_show_summer_2017';
const sheet_id = '17o5KZNG-BveQSJDu_mMHdmZBebOxmnDA9K0G78ctDg4';
const sheet_ranges = [ 'FB_Booth!' ];
const new_ranges = [ 'FB_Booth!P2:P', 'FB_Booth!Q2:Q' ];
//
//

program.command('test').action(async () => {
    await sheets.authenticate();

    const response = await sheets.batchGet(
        '1YauSaoQB3BwmtjqpIbL_ncsOIgwf4EUTfR3RGz73kYk',
        [ 'Sheet1!A2:A', 'Sheet1!B2:B' ]
    );
    console.log(response.valueRanges);
});


program.command('update').action(async () => {
    await mongo.connect('localhost', 27017, 'whitebox');
    await sheets.authenticate();

    // get all the documents
    // NOTE: user input
    const docs = await mongo.find(db);

    // ranges array for batch updat
    // NOTE: user input
    const ranges = new_ranges;
    // values arrays
    const fbids = [];
    const likes = [];

    // loop over all the docs
    for (let i in docs) {
        fbids.push(docs[i].fbid);
        likes.push(docs[i].hasOwnProperty('likes')?docs[i].likes:'');
    }


    // update the sheets
    const s = ora('Updating Sheets...');
    await sheets.batchUpdate(sheet_id, ranges, [ fbids, likes ]);
    s.succeed('Done!');

    Log.info('Updated Sheets!');
});

program.command('prune').action(async () => {
    await mongo.connect('localhost', 27017, 'whitebox');
    const response = await mongo.updateMany(
        db,
        { error: 'Not a valid URL' },
        { $unset: { url: '' } }
    );
    console.log(response.result);
});

program.command('likes').action(async () => {
    await mongo.connect('localhost', 27017, 'whitebox');
    await fb.authenticate();

    // get the fbids from the mongodb
    // NOTE: user input
    const docs = await mongo.find(db, { fbid: { $ne: null } });

    // data array
    let data = [];
    // create a batch array
    let batch = [];

    // loop over the fbids
    for (let i in docs) {
        // push the fbid onto the batch stack
        batch.push({ method: 'GET', relative_url: `/v2.9/${docs[i].fbid}?fields=fan_count` });
        if (i != 0 && i % 49 == 0) {
            let s = ora('Batching 50 to FB Graph...');
            const response = await fb.batch(batch);
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
        if (data[i].error)
            continue;
        mongo.update(db, { _id: docs[i]._id }, { $set: { likes: data[i].fan_count } });
    }

    Log.info('Done!');
});

program.command('killdupe').action(async () => {
    await mongo.connect('localhost', 27017, 'whitebox');
    // NOTE: user input
    const response = await mongo.removeDuplicates(db, 'company');
    console.log(response.result);
});

program.command('facebook').action(async () => {

    let s = ora('Getting Sheet data...');

    // authenticate with sheets
    await sheets.authenticate();

    // connect to mongodb
    await mongo.connect('localhost', 27017, 'whitebox');

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
    const companies = data.valueRanges[0].values;
    const urls = data.valueRanges[1].values;

    for (let i = 0; i < urls.length; i++) {
        // NOTE: user input
        const url = urlparse(urls[i].shift()).trim();
        const company = companies[i].shift().trim();

        if (!url) {
            mongo.insert(db, { company, url, error: 'Not a valid URL' }); // NOTE: user input
            continue;
        }

        s = ora(`Loading URL for ${chalk.yellow(company)}: ${chalk.dim(url)} ...`, `url_${i}`);

        try {
            const html = await request({
                url,
                followRedirect: true,
                headers: {
                    'User-Agent': 'node.js'
                }
            });
            s.succeed(`Done! (${chalk.dim(url)}):${i}`);
            const fbid = await facebook(html);
            await mongo.insert(db, { company, url, fbid });
        }
        catch (ex) {
            s.fail('Oh no!');
            // NOTE: user input
            mongo.insert(db, { company, url, error: 'Failed to scrape' });
        }
    }

    Log.info('All done!');

});

// parse the input and run the commander program
program.parse(process.argv);

// show help if we didn't specify any valid input
if (!process.argv.slice(2).length)
    program.help();

// routines

async function facebook(html) {
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
