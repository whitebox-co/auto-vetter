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
const muda = require('./util/muda');
const fs = require('fs');
const MongoDB = require('./app/mongodb');

const FB_REGEX = /(?:(?:http|https):\/\/)?(?:www.)?facebook.com\/(?:(?:\w)*#!\/)?(?:pages\/)?([\w\-]*)?/;

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

// create an action for starting the scrape
program
    .command('start')
    .description('Starts the scrape')
    .action(async () => {
        // authenticate with google
        //await sheets.authenticate();

        // get sheet range data
        /*const data = await sheets.getSheetRange(
            '1Gtleo_dur1sOG88BwOQVJ8ZXVzGmbI1lIy1KfqPtIr0',
            'Vetting!F2:F4'
        );*/

        const urls = [
            'http://www.crayola.com/',
            'http://www.jellybelly.com/',
            'http://www.ty.com/',
            'http://www.toysrus.com/',
            'http://www.razor.com/'
        ];

        // loop over the URLs from the spreadsheet
        for (let url of urls) {
            //url = url.shift();
            try {
                // scrape a page
                const html = await scrapy.scrape(url);

                // call routine for facebook
                await facebook(html);

            }
            catch (e) {
                Log.error(e);
            }
        }
    });

program.command('mongo').action(async () => {
    await mongo.connect('localhost', 27017, 'whitebox');

    const data = [
        { url: 'https://google.com', fbid: 'google' },
        { url: 'https://facebook.com', fbid: 'facebook' },
        { url: 'https://crayola.com', fbid: 'crayola' }
    ];

    await mongo.insert('test', data);

    Log.info('Files done!');
});

program.command('prune').action(async () => {
    await mongo.connect('localhost', 27017, 'whitebox');
    const response = await mongo.updateMany(
        'fb',
        { error: 'Not a valid URL' },
        { $unset: { url: '' } }
    );
    console.log(response.result);
});

program.command('likes').action(async () => {
    await mongo.connect('localhost', 27017, 'whitebox');
    await fb.authenticate();

    // get the fbids from the mongodb
    const docs = await mongo.find('fb', { fbid: { $ne: null } });

    // data array
    let data = [];
    // create a batch array
    let batch = [];

    // loop over the fbids
    for (let i in docs) {
        // push the fbid onto the batch stack
        batch.push({ method: 'GET', relative_url: `/v2.9/${docs[i].fbid}?fields=fan_count` });
        if (i != 0 && i % 49 == 0) {
            muda.ora('Batching 50 to FB Graph...');
            const response = await fb.batch(batch);
            muda.da().succeed('Done!');
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
        mongo.update('fb', { _id: docs[i]._id }, { $set: { likes: data[i].fan_count } });
    }

    Log.info('Done!');
});

program.command('agy').action(async () => {
    await mongo.connect('localhost', 27017, 'whitebox');
    const response = await mongo.removeDuplicates('fb', 'company');
    console.log(response.result);
});

program.command('status').action(() => {
    scrapy.checkup();
});

program.command('fb2').action(async () => {

    muda.ora('Getting Sheet data...');
    //let mu = ora('Getting sheet data');

    // authenticate with sheets
    await sheets.authenticate();

    // connect to mongodb
    await mongo.connect('localhost', 27017, 'whitebox');

    let data;
    try {
        data = await sheets.getSheetRanges(
            '1YW4aR5KmWk0JPQtJwxzVayH1OjCmUEfqkQAnjuSJhig',
            ['List!C:C','List!F:F']
        );
    }
    catch (ex) {
        Log.error(ex);
        for (let error of ex.errors)
            Log.error(error.message);
        throw ex;
    }

    // get the values from the data
    if (!data) {
        muda.da().fail('No data!');
        throw Error('Data null');
    }

    // done with fetching sheets data
    muda.da().succeed('Done!');

    // separate out the data
    const companies = data.valueRanges[0].values;
    const urls = data.valueRanges[1].values;
    // shift off the first from each
    companies.shift();
    urls.shift();

    for (let i = 0; i < urls.length; i++) {
        const url = urlparse(urls[i].shift()).trim();
        const company = companies[i].shift().trim();

        if (!url) {
            mongo.insert('fb', { company, url, error: 'Not a valid URL' });
            continue;
        }

        muda.ora(`Loading URL for ${chalk.yellow(company)}: ${chalk.dim(url)} ...`, `url_${i}`);

        try {
            const html = await request({
                url,
                followRedirect: true,
                headers: {
                    'User-Agent': 'node.js'
                }
            });
            muda.da(`url_${i}`).succeed(`Done! (${chalk.dim(url)}):${i}`);
            const fbid = await facebook(html);
            await mongo.insert('fb', { company, url, fbid });
        }
        catch (ex) {
            muda.da(`url_${i}`).fail('Oh no!');
            mongo.insert('fb', { company, url, error: 'Failed to scrape' });
        }
    }

    Log.info('All done!');

});

program
    .command('fb')
    .description('Scrape a Sheets document for FB pages and their likes')
    .action(async () => {
        // authenticate with sheets
        await sheets.authenticate();

        let data;
        try {
            // get sheet range data with google
            data = await sheets.getSheetRange('1YW4aR5KmWk0JPQtJwxzVayH1OjCmUEfqkQAnjuSJhig', `List!F:F`);
        }
        catch (ex) {
            Log.error(ex);
            for (let error of ex.errors)
                Log.error(error.message);
            throw ex;
        }

        // get the values from the data
        const values = data['values'];

        let incr = 3;
        // loop over the URLs from the sheets
        for (let i = 1; i < values.length; i += incr) {
            // get a local array of job ids to scrape from
            const jobs = [];
            // check if we have more than incr left
            if (values.length - i < incr)
                incr = values.length - i;

            // queue jobs at a time
            for (let j = 0; j < incr; j++) {
                let job_id;
                try {
                    job_id = await scrapy.queue(values[i + j][0]);
                    jobs.push(job_id);
                }
                catch (ex) {
                    Log.error(ex);
                }
            }

            // wait for these jobs to finish
            await scrapy.checkup(incr);

            // get the data from the S3 URLs
            for (let job of jobs) {
                Log.info(`Trying job ${job}`);
                // get the job data
                const json = await scrapy.getJob(job);
                // get the s3 url and request it
                const html = await request(json.s3_url);
                // execute the Facebook routine on the data
                await facebook(html);
            }

            // wait 5 seconds before loop
            await sleep(5000);
        }

        /*
        // loop over the URLs from the spreadsheet
        for (let url of urls) {
            try {
                // scrape a page
                const html = await scrapy.scrape(url);
                // load cheerio up for scraping time
                const $ = cheerio.load(html);

                // call routine for facebook
                await facebook(html, $);
            }
            catch (e) {
                Log.error(e);
            }
        }*/
    });

program
    .command('google')
    .description('Google Sheets API test')
    .action(async () => {
        try {
            // authenticate with google
            await sheets.authenticate();

            // get sheet range data
            const data = await sheets.getSheetRanges(
                '1YW4aR5KmWk0JPQtJwxzVayH1OjCmUEfqkQAnjuSJhig',
                ['List!C:C','List!F:F']
            );

            console.log(data);
        }
        catch (e) {
            Log.error(e);
        }
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
                fburl = href;
        }
    });

    return fburl;
}

const numb = n => {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
