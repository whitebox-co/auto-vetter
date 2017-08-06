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
const asyncWrap = require('./util/asyncWrap');

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

// create instance of MongoDB
const mongo = new MongoDB(
    process.env.MONGO_HOST,
    process.env.MONGO_PORT,
    process.env.MONGO_DB_NAME
);

// create instance of alexa
const alexa = new AlexaAPI(
    process.env.AMAZON_ACCESS_KEY,
    process.env.AMAZON_SECRET_KEY
)

//
// NOTE: USER FIELDS PLEASE CHANGE THANKS
const db = '1q43WF4SNCNatural Expo East';
const sheet_id = '1q43WF4SNCosLtFLnA5wFbroVp0l9ybgOiK27uvNnaUA';
const sheet_ranges = [ 'Natural Expo East!A2:A', 'Natural Expo East!I2:I' ];
const new_ranges = [ 'Natural Expo East!J2:J', 'Natural Expo East!K2:K', 'Natural Expo East!L2:L' ];
//
//

program.command('alexa').action(async () => {
    await mongo.connect();
    const docs = await mongo.find(db, { url: { $ne: null } });

    let data = [];
    let batch = [];

    for (let i in docs) {
        batch.push(docs[i].url);
        if (i != 0 && i % 4 == 0) {
            let s = ora('Batching 5 to Alexa...').start();
            const response = await asyncWrap([ alexa, 'getURLInfo' ], batch, 'Rank');
            s.succeed('Done!');
            batch = [];
            data = [ ...data, ...response['aws:Response'] ];
            require('./util/sleep')(500);
        }
    }

    // one last batch
    if (batch.length) {
        const response = await asyncWrap([ alexa, 'getURLInfo' ], batch, 'Rank');
        data = [ ...data, ...response['aws:Response'] ];
    }

    for (let i in data) {
        const alexa_rank = data[i]['aws:UrlInfoResult']['aws:Alexa']['aws:TrafficData']['aws:Rank'];
        if (typeof alexa_rank === 'string')
            mongo.update(db, { _id: docs[i]._id }, { $set: { alexa_rank: _.parseInt(alexa_rank) } });
    }

    Log.info('Done!');
});

program.command('update').action(async () => {
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
});

program.command('prune').action(async () => {
    await mongo.connect();
    const response = await mongo.updateMany(
        db,
        { error: 'Not a valid URL' },
        { $unset: { url: '' } }
    );
    console.log(response.result);
});

program.command('likes').action(async () => {
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
            //Log.error(data[i].error);
            continue;
        }
        Log.info(data[i].fan_count);
        mongo.update(db, { _id: docs[i]._id }, { $set: { likes: data[i].fan_count } });
    }

    Log.info('Done!');
});

program.command('killdupe').action(async () => {
    await mongo.connect();
    // NOTE: user input
    const response = await mongo.removeDuplicates(db, 'company');
    console.log(response.result);
});

program.command('facebook').action(async () => {

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
            const fb = await facebook(html);
            await mongo.insert(db, _.merge(minsert, { facebook: fb }));
        }
        catch (ex) {
            s.fail('Oh no!');
            // NOTE: user input
            mongo.insert(db, _.merge(minsert, { error: 'Failed to scrape' }));
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
