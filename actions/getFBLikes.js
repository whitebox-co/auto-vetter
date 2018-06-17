const { createAction } = require('./');
const _ = require('lodash');
const puppeteer = require('puppeteer');
const Log = require('../util/log');
const Sheets = require('../app/sheets');
const MongoDB = require('../app/mongodb');
const ora = require('ora');
const Sentry = require('../app/sentry');

// regex for likes on the page
const LIKES_REGEX = new RegExp(/([0-9,]+) people like this/g);

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
 * Gets FB likes for a given collection
 * @param {Object} param0 Application state
 */
const getFBLikes = async ({ collection }) => {

    // connect to mongo database
    await mongo.connect();

    // get the collection docs
    const docs = await mongo.find(collection, { facebook: { $ne: null } });
    if (_.isNull(docs))
        throw new Error(`Collection '${collection}' contains no documents!`);

    // create a new browser instance
    const browser = await puppeteer.launch({ headless: true });
    // load up a new page
    const page = await browser.newPage();

    // loop over the docs
    for (let i = 0; i < docs.length; i++) {

        // create spinner and reference to doc
        const doc = docs[i];
        const s = ora().start(`Fetching Likes from ${doc.facebook}`);

        try {
            // goto the facebook page
            await page.goto(doc.facebook);
            // get page content
            const content = await page.content();
            // get the likes baby
            const matches = LIKES_REGEX.exec(content);

            // add the likes to the mongo db
            if (_.isArray(matches) && matches[1])
                await mongo.update(collection, { row: doc.row }, { $set: { likes: matches[1] } });

            // we did it
            s.succeed(`Found ${matches[1]} likes (${doc.facebook})`);
        }
        catch (ex) {
            // we didn't do it
            s.fail(`Likes failed for ${doc.facebook}`);
            // add an error for good measure
            await mongo.update(collection, { _id: doc._id }, { $set: { error_likes: ex.message } });
        }
        
    }

    // close mongo connection
    await mongo.close();

};

module.exports = createAction('getFBLikes', getFBLikes);
