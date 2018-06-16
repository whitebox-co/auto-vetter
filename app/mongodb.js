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
     * @returns {Object|null} Collection object or null if it failed
     */
    async getCollection(name) {
        try {
            return await this.client.collection(name);
        }
        catch (ex) {
            return null;
        }
    }

    /**
     * Create a collection
     * @param {String} name Collection name
     */
    async createCollection(name) {
        try {
            return await this.client.createCollection(name);
        }
        catch (ex) {
            Sentry.captureException(ex);
        }
    }

    /**
     * Delete a collection
     * @param {String} name Collection name
     */
    async drop(name) {
        try {
            return await this.client.collection(name).drop();
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
            const data = await this.client.listCollections().toArray();
            return _.map(data, 'name').indexOf(name) != -1;
        }
        catch (ex) {
            Sentry.captureException(ex);
        }
    }

    /**
     * Find documents on a collection with a filter
     * @param {Object} collection 
     * @param {Object} filter 
     * @returns {Array[Object]}
     */
    async find(collection, filter = {}) {
        if (!this.client)
            return;

        const col = this.client.collection(collection);
        try {
            return await col.find(filter).toArray();
        }
        catch (ex) {
            Sentry.captureException(ex);
        }
    }

    /**
     * Insert data into a collection
     * @param {Object} collection 
     * @param {Object} data 
     */
    async insert(collection, data) {
        if (!this.client)
            return;

        const col = this.client.collection(collection);
        // insert data
        try {
            return await col.insert(data);
        }
        catch (ex) {
            Sentry.captureException(ex);
        }
    }

    /**
     * Remove duplicates based on a string
     * @param {Object} collection 
     * @param {String} field 
     */
    async removeDuplicates(collection, field) {
        if (!this.client)
            return;

        const col = this.client.collection(collection);

        try {
            const _id = {};
            _id[field] = '$'+field;
            const dups = [];

            const cursor = await col.aggregate([
                {
                    $group: {
                        _id,
                        dups: { $addToSet: '$_id' },
                        count: { $sum: 1 }
                    }
                },
                {
                    $match: {
                        count: { $gt: 1 }
                    }
                }
            ]);

            cursor.forEach(doc => {
                // skip the first element
                doc.duplicates.shift();
                // for each delete them
                col.remove({ _id: { $in: doc.dups }});
            });
        }
        catch (ex) {
            Sentry.captureException(ex);
        }
    }

    /**
     * Update a document on a collection based on a filter
     * @param {Object} collection 
     * @param {Object} filter 
     * @param {Object} data 
     */
    async update(collection, filter, data) {
        if (!this.client)
            return;

        const col = this.client.collection(collection);
        // update data
        try {
            return await col.update(filter, data);
        }
        catch (ex) {
            Sentry.captureException(ex);
        }
    }

    /**
     * Update many documents on a collection based on a filter
     * @param {Object} collection 
     * @param {Object} filter 
     * @param {Object} data 
     */
    async updateMany(collection, filter, data) {
        if (!this.client)
            return;

        const col = this.client.collection(collection);
        // update data
        try {
            return await col.updateMany(filter, data);
        }
        catch (ex) {
            Sentry.captureException(ex);
        }
    }

}

module.exports = MongoDB;
