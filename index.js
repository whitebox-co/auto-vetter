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

const { runAction } = require('./actions');

// log the header
console.log(boxen(
	chalk.black('Whitebox Auto Vetter'),
	{ padding: 1, backgroundColor: 'white' }
));

// main async loop
Sentry.asyncContext(async () => {

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

});
