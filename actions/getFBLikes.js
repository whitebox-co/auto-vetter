const { createAction } = require('./');
const _ = require('lodash');
const puppeteer = require('puppeteer');
const Log = require('../util/log');
const Sheets = require('../app/sheets');
const MongoDB = require('../app/mongodb');
const ora = require('ora');
const Sentry = require('../app/sentry');
const request = require('request-promise');

// likes URL base
const FB_LIKES_URL = 'https://www.facebook.com/plugins/fan.php?id=';

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

        // get url and slice off end slash if one exists
        const url = doc.facebook.endsWith('/') ? doc.facebook.slice(0, -1) : doc.facebook;

        try {
            // goto the facebook page
            await page.goto(FB_LIKES_URL + url);
            //const content = await request(FB_LIKES_URL + url);
            // get the content from the page
            const content = await page.content();

            // get likes with regex
            const matches = /([0-9,]+) likes/.exec(content);
            // strip the commas from the number
            const likes = matches[1].replace(/,/, '');

            // add the likes to the mongo db
            if (_.isEmpty(likes))
                throw new Error("Couldn't find any Likes");

            // update the doc with likes
            await mongo.update(collection, { row: doc.row }, { $set: { likes: _.toNumber(likes) } });

            // we did it
            s.succeed(`Found ${likes} likes (${url})`);
        }
        catch (ex) {
            // we didn't do it
            s.fail(`Likes failed for ${url}`);
            Log.error(ex.message);
            // add an error for good measure
            await mongo.update(
                collection,
                { _id: doc._id },
                {
                    $set: {
                        error: {
                            ...(_.isObject(doc.error) ? doc.error : { legacy: doc.error }),
                            likes: ex.message
                        }
                    }
                }
            );
        }
        
    }

    // close the browser
    await browser.close();
    // close mongo connection
    await mongo.close();

};

module.exports = createAction('getFBLikes', getFBLikes);
