const { MongoClient } = require('mongodb');
const _ = require('lodash');
const Sentry = require('./sentry');

class MongoDB {

    /**
     * Create instance of MongoDB class
     * @param {String} host Host address
     * @param {Number} port Port number
     * @param {String} db Database name
     */
    constructor(host, port, db) {
        this.host = host;
        this.port = port;
        this.db = db;
    }

    /**
     * Connect to the mongo database
     */
    async connect() {
        try {
            const url = `mongodb://${this.host}:${this.port}/${this.db}`;
            this.client = await MongoClient.connect(url);
            this.clientDB = this.client.db(this.db);
        }
        catch (ex) {
            Sentry.captureException(ex);
        }
    }

    /**
     * Close the connection
     */
    async close() {
        this.client && await this.client.close();
    }

    /**
     * Get a collection
     * @param {String} name Collection name
     * @returns {Promise<(Object|null)>} Collection object or null if it failed
     */
    async getCollection(name) {
        try {
            return await this.clientDB.collection(name);
        }
        catch (ex) {
            return null;
        }
    }

    /**
     * Create a collection
     * @param {String} name Collection name
     * @returns {Promise} Completes when collection is created
     */
    async createCollection(name) {
        try {
            return await this.clientDB.createCollection(name);
        }
        catch (ex) {
            Sentry.captureException(ex);
        }
    }

    /**
     * Delete a collection
     * @param {String} name Collection name
     * @returns {Promise} Completes when collection has been dropped
     */
    async drop(name) {
        try {
            return await this.clientDB.collection(name).drop();
        }
        catch (ex) {
            Sentry.captureException(ex);
        }
    }

    /**
     * Does a collection name exist
     * @param {String} name Name of the collection
     * @returns {Boolean} True if collection exist
     */
    async doesCollectionExist(name) {
        try {
            const data = await this.clientDB.listCollections().toArray();
            return _.map(data, 'name').indexOf(name) != -1;
        }
        catch (ex) {
            Sentry.captureException(ex);
        }
    }

    /**
     * Find documents on a collection with a filter
     * @param {String} collection 
     * @param {Object} filter 
     * @param {Object} options
     * @returns {Array<Object>}
     */
    async find(collection, filter = {}, options = {}) {     
        try {
            if (!this.client)
                throw new Error('No valid connection.');
            const col = this.clientDB.collection(collection);
            return await col.find(filter, options).toArray();
        }
        catch (ex) {
            Sentry.captureException(ex);
        }
    }

    /**
     * Insert data into a collection
     * @param {String} collection 
     * @param {Object} data 
     * @returns {Promise} Complete when data is inserted
     */
    async insert(collection, data) {
        try {
            if (!this.client)
                throw new Error('No valid connection.');
            const col = this.clientDB.collection(collection);
            return await col.insert(data);
        }
        catch (ex) {
            Sentry.captureException(ex);
        }
    }

    /**
     * Remove duplicates based on a string
     * @param {String} collection 
     * @param {String} field 
     * @returns {Promise} Complete when all duplicates are removed
     */
    async removeDuplicates(collection, field) {
        try {
            if (!this.client)
                throw new Error('No valid connection.');

            const col = this.clientDB.collection(collection);
            
            const _id = {};
            _id[field] = '$'+field;
            const dups = [];

            const cursor = await col.aggregate([
                {
                    $group: {
                        _id,
                        duplicates: { $addToSet: '$_id' },
                        count: { $sum: 1 }
                    }
                },
                {
                    $match: {
                        count: { $gt: 1 }
                    }
                }
            ]);

            cursor.forEach(async doc => {
                // skip the first element
                doc.duplicates.shift();
                // for each delete them
                await col.remove({ _id: { $in: doc.duplicates }});
            });
        }
        catch (ex) {
            Sentry.captureException(ex);
        }
    }

    /**
     * Update a document on a collection based on a filter
     * @param {String} collection 
     * @param {Object} filter 
     * @param {Object} data 
     * @returns {Promise} Complete when update is finished
     */
    async update(collection, filter, data) {
        try {
            if (!this.client)
                throw new Error('No valid connection.');
    
            const col = this.clientDB.collection(collection);
            return await col.update(filter, data, { upsert: true });
        }
        catch (ex) {
            Sentry.captureException(ex);
        }
    }

    /**
     * Update many documents on a collection based on a filter
     * @param {String} collection 
     * @param {Object} filter 
     * @param {Object} data 
     * @returns {Promise} Complete when update is finished
     */
    async updateMany(collection, filter, data) {
        try {
            if (!this.client)
                throw new Error('No valid connection.');
    
            const col = this.clientDB.collection(collection);
            return await col.updateMany(filter, data, { upsert: true });
        }
        catch (ex) {
            Sentry.captureException(ex);
        }
    }

}

module.exports = MongoDB;
