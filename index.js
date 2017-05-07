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

const facebook_regex = /(?:https?:\/\/)?(?:www\.)?facebook\.com\/(?:(?:\w)*#!\/)?(?:pages\/)?(?:[\w\-]*\/)*([\w\-\.]*)/;

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
            'http://www.jellybelly.com/'
            //'http://www.ty.com/',
            //'http://www.toysrus.com/',
            //'http://www.razor.com/'
        ];

        // loop over the URLs from the spreadsheet
        for (let url of urls) {
            //url = url.shift();
            try {
                // scrape a page
                const html = await request(url);//scrapy.scrape(url);
                // load cheerio up for scraping time
                const $ = cheerio.load(html);

                // call routine for facebook
                await facebook(html, $);

            }
            catch (e) {
                Log.error(e);
            }
        }
    });

program
    .command('google')
    .description('Google Sheets API test')
    .action(async () => {
        try {
            // create new instance of sheets
            const sheets = new Sheets(
                process.env.GOOGLE_CLIENT_ID,
                process.env.GOOGLE_CLIENT_SECRET
            );

            // authenticate with google
            await sheets.authenticate();

            // get sheet range data
            const data = await sheets.getSheetRange(
                '1Gtleo_dur1sOG88BwOQVJ8ZXVzGmbI1lIy1KfqPtIr0',
                'Vetting!C2:C4'
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

async function facebook(html, $) {
    let fbid = null;
    // search for Facebook URL
    $('a').each((i, elem) => {
        const href = $(elem).attr('href')
        if (href) {
            const matches = href.match(facebook_regex);
            if (matches && matches.length)
                fbid = matches[1];
        }
    });

    if (!fbid) {
        Log.info('No Facebook detected.');
        return false;
    }

    Log.info(`Found Facebook ID ${chalk.bold.red(fbid)}`);

    // scrape the Facebook page to get them likes 👍🏻
    //const html = await scrapy.scrape(matches[0]);
    // authenticate with facebook API
    await fb.authenticate();

    let spinner = ora('Fetching Likes').start();
    // get them likes boy
    try {
        const data = await fb.get(`/v2.9/${fbid}`, { fields: 'fan_count' });
        spinner.succeed();
        Log.info(`${chalk.bold.red(fbid)} has ${chalk.yellow(numb(data.fan_count))} likes 👍`);
    }
    catch (e) {
        spinner.fail();
        // throw e;
    }

    return true;
}

const numb = n => {
    return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
