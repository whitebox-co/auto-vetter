/**
 * scrapy.js
 * This file is a class which interfaces with the ScrapingHub API.
 * @author James Stine <Leon.Blade@gmail.com>
 */

const request = require('request-promise');
const Log = require('../util/log');
const sleep = require('../util/sleep');

class Scrapy {

    /**
     * Creates an instance of the scraper
     * @constructor
     * @param   {String} key      Scraping Hub API Key
     * @param   {Number} project  The project ID
     * @param   {String} spider   The name of the spider to use
     */
    constructor(key, project, spider) {
        this.key = key;
        this.project = project;
        this.spider = spider;
    }

    /**
     * Scrapes a URL
     * @public
     * @param   {String}  url The URL to scrape
     * @returns {String}      Returns the data from the scrape
     */
    async scrape(url) {
        // create a request to scrapy
        const response = await request({
            method: 'POST',
            url: 'https://app.scrapinghub.com/api/run.json',
            auth: {
                user: this.key,
                pass: ''
            },
            form: {
                project: this.project,
                spider: this.spider,
                add_tag: 'wbscraper',
                input_url: url
            }
        });

        // parse the JSON response
        const json = JSON.parse(response);
        // wait for the job to complete
        const job_data = await this.checkScrape(json.jobid);
        // pull the S3 URL out and get the scrape data
        const html = await request(job_data.s3_url);

        // return the html scraped
        return html;
    }

    /**
     * Used internally by the class to check for job status
     * @private
     * @param   {String}  job_id  The job ID to check up on
     * @returns {Object}
     */
    async checkScrape(job_id) {
        // get the reponse from checking the job status
        const response = await request({
            url: `https://storage.scrapinghub.com/items/${job_id}`,
            auth: {
                user: this.key,
                pass: ''
            }
        });

        // if we don't have results then wait and try again
        if (!response) {
            // wait and sleep for timeout
            await sleep(2000);
            // check the scrape again
            return this.checkScrape(job_id);
        }

        // return the reponse
        return JSON.parse(response);
    }

}

module.exports = Scrapy;
