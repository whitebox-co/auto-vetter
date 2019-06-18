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
const updateSheet = async ({ collection, sheet_id  }) => {

    // connect and auth to mongo/sheets
	await mongo.connect();
	await sheets.authenticate();

    // find the documents for this collection
	const docs = await mongo.find(collection, { url: { $ne: "" } });
    // ensure docs exist for this database
	if (!docs || !docs.length > 0)
		throw new Error(`Didn't find documents for '${collection}'!`);

	// make sure av data sheet is created
	await sheets.createSheet(sheet_id, 'AV Data');

	// set the new ranges
	const ranges = [
		'AV Data!A:A',
		'AV Data!B:B',
		'AV Data!C:C',
		'AV Data!D:D'
	];

	Log.info("Updating spreadsheet...");

	// values arrays
	const urls = ['URL'];
	const fburls = ['Facebook'];
	const likes = ['Likes'];
	const aranks = ['Alexa'];

	// loop over all the docs
	for (let i in docs) {
		urls.push(docs[i].url);
		fburls.push(docs[i].hasOwnProperty('facebook') ? docs[i].facebook : null);
		likes.push(docs[i].hasOwnProperty('likes') ? docs[i].likes : null);
		aranks.push(docs[i].alexa_rank);
	}

	// update the sheets
	const s = ora('Updating Sheets...');
	await sheets.batchUpdate(sheet_id, ranges, [ urls, fburls, likes, aranks ]);
	s.succeed('Done!');

	Log.info('Updated Sheets!');

	// close mongo connection
	await mongo.close();
	
};

module.exports = createAction('updateSheet', updateSheet);
