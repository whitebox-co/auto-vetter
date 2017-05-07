/**
 * Whitebox Scraper
 *
 * @author James Stine <Leon.Blade@gmail.com>
 */

// obtain environment variables from .env file
require('dotenv').config();

// require modules needed for this file
const chalk = require('chalk');
const cheerio = require('cheerio');
const program = require('commander');
const Log = require('./util/log');
const Scrapy = require('./app/scrapy');
const Sheets = require('./app/sheets');

// set the program version
program.version('0.1.0');

// default action
program.action(() => program.help());

// create an action for starting the scrape
program
    .command('start')
    .description('Starts the scrape')
    .action(async () => {
        // get sample data to scrape
        //let data = ['https://google.com/', 'https://amazon.com/', 'https://twitter.com/'];
        // call scrape routine

        // create instance of scrapy
        const scrapy = new Scrapy(
            process.env.SCRAPY_API_KEY,
            process.env.SCRAPY_PROJECT_ID,
            process.env.SCRAPY_SPIDER
        );

        // scrape a page
        const html = await scrapy.scrape('https://5835366e.ngrok.io/');
        // load cheerio up for scraping time
        const $ = cheerio.load(html);

        const h2 = $('h2').text();

        console.log(`h2 = ${h2}`);
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
