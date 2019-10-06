/**
 * Whitebox Scraper
 *
 * @author James Stine <Leon.Blade@gmail.com>
 */

// obtain environment variables from .env file
require('dotenv').config();

// require modules needed for this file
const chalk = require('chalk');
const Log = require('./util/log');
const boxen = require('boxen');
const inquirer = require('inquirer');
const Sentry = require('./app/sentry');
const moment = require('moment');
const Sheets = require('./app/sheets');
const ora = require('ora');

const { runAction } = require('./actions');

// log the header
console.log(chalk.green('Whitebox Auto Vetter'));

const NEW_SCRAPE = Symbol('NEW_SCRAPE');
const RUN_SCRAPE = Symbol('RUN_SCRAPE');
const FB_LIKES = Symbol('FB_LIKES');

// create instance of sheets
const sheets = new Sheets(
	process.env.GOOGLE_CLIENT_ID,
	process.env.GOOGLE_CLIENT_SECRET
);

// main async loop
(async () => {

	const startupOpts = await inquirer.prompt([
		{
			type: 'list',
			name: 'startup',
			message: 'What would you like to do?',
			choices: [
				{ name: 'Create new scrape', value: NEW_SCRAPE },
				{ name: 'Run existing scrape', value: RUN_SCRAPE },
				{ name: 'Get Facebook Likes on existing sheet', value: FB_LIKES }
			]
		}
	]);

	switch (startupOpts.startup) {
		case NEW_SCRAPE:
			// return data back
			const data = await runAction('create_scrape');

			// store sheet id
			const sheet_id = data['spreadsheetId'];
			const sheet_name = data['sheetName'];
			// store the collection
			const collection = sheet_id.slice(0, 10) + sheet_name;
			// assumes data starts at row 2
			const sheet_ranges = [
				`${sheet_name}!A2:A`,
				`${sheet_name}!${data['urlColumn']}2:${data['urlColumn']}`
			];

			// the scrape run options
			const runOpts = await inquirer.prompt([
				{
					type: 'checkbox',
					name: 'choices',
					message: 'Pick what you want to scrape for',
					choices: [
						{ name:'Facebook' }, 
						{ name:'Facebook Likes' },
						{ name:'Alexa' }, 
						{ name:'Update Spreadsheet' }
					]
				}
			]);

			// app state to pass to actions
			const state = { sheet_id, sheet_name, collection, sheet_ranges };

			// run the commands
			if (runOpts['choices'].includes('Facebook'))
				await runAction('getFBUrls', state);

			if (runOpts['choices'].includes('Facebook Likes'))
				await runAction('getFBLikes', state);

			if (runOpts['choices'].includes('Alexa'))
				await runAction('getPageRank', state);

			if (runOpts['choices'].includes('Update Spreadsheet'))
				await runAction('updateSheet', state);
			
			Log.info("Scrape completed!");
			break;

		case RUN_SCRAPE:
			Log.error('Not currently implemented!');
			break;

		case FB_LIKES:
			// get the prep data
			const { spreadsheetId, urls } = await runAction('fb_prep');
			
			// get FB likes from the URL data we have
			const fbLikes = await runAction('getFBLikesSS', urls);

			// connect and auth to sheets
			await sheets.authenticate();

			// make sure av data sheet is created
			await sheets.createSheet(spreadsheetId, 'AV Data');

			// set the new ranges
			const ranges = [
				'AV Data!A:A',
				'AV Data!B:B',
			];

			Log.info("Updating spreadsheet...");

			// values arrays
			const fburls = ['Facebook', ...urls];
			const likes = ['Likes', ...fbLikes];

			// update the sheets
			const s = ora('Updating Sheets...');
			await sheets.batchUpdate(spreadsheetId, ranges, [ fburls, likes ]);
			s.succeed('Done!');

			Log.info('Updated Sheets!');

			break;
	}

})();
