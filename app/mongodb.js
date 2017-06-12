const MongoClient = require('mongodb').MongoClient;
const asyncWrap = require('../util/asyncWrap');
const _ = require('lodash');
const Sentry = require('./sentry');

class MongoDB {

    constructor(host, port, db) {
        this.host = host;
        this.port = port;
        this.db = db;
    }

    async connect() {
        try {
            const url = `mongodb://${this.host}:${this.port}/${this.db}`;
            this.client = await MongoClient.connect(url);
        }
        catch (ex) {
            Sentry.captureException(ex);
        }
    }

    async getCollection(name) {
        try {
            return await this.client.collection(name);
        }
        catch (ex) {
            return null;
        }
    }

    async createCollection(name) {
        try {
            return await this.client.createCollection(name);
        }
        catch (ex) {
            Sentry.captureException(ex);
        }
    }

    async drop(name) {
        try {
            return await this.client.collection(name).drop();
        }
        catch (ex) {
            Sentry.captureException(ex);
        }
    }

    async doesCollectionExist(name) {
        try {
            const data = await this.client.listCollections().toArray();
            return _.map(data, 'name').indexOf(name) != -1;
        }
        catch (ex) {
            Sentry.captureException(ex);
        }
    }

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

    async aggregate(collection, field) {
        if (!this.client)
            return;
        const col = this.client.collection(collection);
        try {
            const _id = {};
            _id[field] = '$'+field;
            return await col.aggregate([
                {
                    $group: {
                        _id,
                        uniqueIds: { $addToSet: '$_id' },
                        count: { $sum: 1 }
                    }
                },
                {
                    $match: {
                        count: { $gte: 2 }
                    }
                },
                {
                    $sort: {
                        count: -1
                    }
                }
            ]).toArray();
        }
        catch (ex) {
            Sentry.captureException(ex);
        }
    }

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
                        duplicates: { $addToSet: '$_id' },
                        count: { $sum: 1 }
                    }
                },
                {
                    $match: {
                        count: { $gte: 2 }
                    }
                },
                {
                    $sort: {
                        count: -1
                    }
                }
            ]);

            cursor.forEach(doc => {
                // skip the first element
                doc.duplicates.shift();
                // for each delete them
                doc.duplicates.forEach(dupId => {
                    console.log(dupId);
                    dups.push(dupId)
                });

                return col.remove({ _id: { $in: dups } });
            });
        }
        catch (ex) {
            Sentry.captureException(ex);
        }
    }

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

    async updateMany(collection, filter, data) {
        if (!this.client)
            return;

        const col = this.client.collection(collection);
        // update data
        try {
            //return await asyncWrap([ col, 'updateMany' ], filter, data);
            return await col.updateMany(filter, data);
        }
        catch (ex) {
            Sentry.captureException(ex);
        }
    }

    close() {
        this.client && this.client.close();
    }

}

module.exports = MongoDB;
