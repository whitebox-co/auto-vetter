const { createAction } = require('./');
const MongoDB = require('../app/mongodb');
const Sheets = require('../app/sheets');
const ProgressBar = require('progress');
const Log = require('../util/log');
const _ = require('lodash');
const Sentry = require('../app/sentry');
const AlexaAPI = require('alexa');
const sleep = require('../util/sleep');
const chalk = require('chalk');

// curry the breadcrumb function
const captureBreadcrumb = _.curry(Sentry.captureBreadcrumb)('scrape');

// create instance of MongoDB
const mongo = new MongoDB(
	process.env.MONGO_HOST,
	process.env.MONGO_PORT,
	process.env.MONGO_DB_NAME
);

// create instance of sheets
const sheets = new Sheets(
	process.env.GOOGLE_CLIENT_ID,
	process.env.GOOGLE_CLIENT_SECRET
);

const alexa = new AlexaAPI(
	process.env.AMAZON_ACCESS_KEY,
	process.env.AMAZON_SECRET_KEY
);

const getPageRank = async ({ collection }) => {

    Log.info("Fetching Alexa Page Rank...");

	captureBreadcrumb('Fetching Alexa Page Ranks');

	// connect to mongodb
	await mongo.connect();
	
	// find docs on this collection
	const docs = await mongo.find(collection, { url: { $ne: null } });

	// start a progress bar
	const bar = new ProgressBar(chalk.bold.green('Progress') + ' [:bar] (:current/:total)', {
		total: docs.length,
		incomplete: ' ',
		complete: chalk.bgGreen(' '),
		clear: true
	});

	// increase 5 each time for the batch
	for (let i = 0; i < docs.length; i += 5) {
		// form the urls array
		const urls = [];
		// try to get 5 at a time or cap out
		for (let j = 0; j < 5; j++) {
			if (docs[i + j] == null)
				break;
			urls.push(docs[i + j].url);
		}

		captureBreadcrumb('Batching URLs', { urls });

		try {
			const response = await new Promise((resolve, reject) => {
				alexa.getURLInfo(urls, "Rank", (err, results) => {
					if (err)
						return reject(err);
					return resolve(results);
				});
			});

			let data = response['aws:Response'];

			// set as array for single batches
			if (!_.isArray(data))
				data = [ data ];

			// tick by the amount of rows from data
			bar.tick(data.length);

			// map the array into the ranks
			const ranks = _.map(data, value => {
				try {
					return value['aws:UrlInfoResult']['aws:Alexa']['aws:TrafficData']['aws:Rank'];
				}
				// catch any exceptions from blank URLs to return null
				catch (ex) {
					return null;
				}
			});

			captureBreadcrumb('Received ranks!');

			// loop over our ranks and update
			for (let j = 0; j < ranks.length; j++)
				if (typeof ranks[j] === 'string')
					await mongo.update(collection, { _id: docs[i + j]._id }, { $set: { alexa_rank: _.parseInt(ranks[j]) } });

		}
		catch (ex) {
			// capture the exception
			Sentry.captureException(ex);

			// set on all of the batched URLs that it failed for this batch
			for (let j = 0; j < urls.length; j++) {
				await mongo.update(
					collection,
					{ _id: docs[i + j]._id },
					{
						$set: {
							error: {
								...(_.isObject(docs[i + j].error) ? docs[i + j].error : { legacy: docs[i + j].error }),
								alexa: ex.message
							}
						}
					}
				);
			}
		}
		// sleep to not overload the API
		await sleep(500);
	}

	Log.info('Done!');
	Log.warn(`${chalk.bold.yellow('NOTE:')} If the progress bar is still visible, press a key to update the output stream.`);
	bar.terminate();

	// close mongo connection
    await mongo.close();
    
};

module.exports = createAction('getPageRank', getPageRank);
