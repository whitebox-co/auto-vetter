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

// parse the input and run the commander program
program.parse(process.argv);

// show help if we didn't specify any valid input
if (!process.argv.slice(2).length)
    program.help();
