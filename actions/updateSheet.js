const { createAction } = require('./');
const _ = require('lodash');
const Log = require('../util/log');
const MongoDB = require('../app/mongodb');
const Sheets = require('../app/sheets');
const inquirer = require('inquirer');
const ora = require('ora');

// create instance of sheets
const sheets = new Sheets(
	process.env.GOOGLE_CLIENT_ID,
	process.env.GOOGLE_CLIENT_SECRET
);

// create instance of MongoDB
const mongo = new MongoDB(
	process.env.MONGO_HOST,
	process.env.MONGO_PORT,
	process.env.MONGO_DB_NAME
);

/**
 * Update the spreadsheet with data in mongodb
 * @param {AppState} param0 
 */
const updateSheet = async ({ collection, sheet_id, sheet_name }) => {

    // connect and auth to mongo/sheets
	await mongo.connect();
	await sheets.authenticate();

    // find the documents for this collection
	const docs = await mongo.find(collection, {}, { sort: { row: 1 } });
    // ensure docs exist for this database
	if (!docs || !docs.length > 0)
		throw new Error(`Didn't find documents for '${collection}'!`);

	// ensure its not empty
	const validate = input => {
		return input.length > 0;
	}

	// query for columns
	const rs = await inquirer.prompt([
		{
			type: 'text',
			name: 'fburl',
			message: 'Enter the letter column for Facebook URLs',
			validate
		},
		{
			type: 'text',
			name: 'likes',
			message: 'Enter the letter column for Facebook Likes',
			validate
		},
		{
			type: 'text',
			name: 'alexa',
			message: 'Enter the letter column for Alexa Rank',
			validate
		}
	]);

	// set the new ranges
	const new_ranges = [
		`${sheet_name}!${rs['fburl']}2:${rs['fburl']}`,
		`${sheet_name}!${rs['likes']}2:${rs['likes']}`,
		`${sheet_name}!${rs['alexa']}2:${rs['alexa']}`
	];

	Log.info("Updating spreadsheet...");

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
		likes.push(docs[i].hasOwnProperty('likes') ? docs[i].likes : null);
		aranks.push(docs[i].alexa_rank);
		lastRow = docs[i].row;
	}

	// update the sheets
	const s = ora('Updating Sheets...');
	await sheets.batchUpdate(sheet_id, ranges, [ fburls, likes, aranks ]);
	s.succeed('Done!');

	Log.info('Updated Sheets!');

	// close mongo connection
	await mongo.close();
	
};

module.exports = createAction('updateSheet', updateSheet);
