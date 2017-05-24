const MongoClient = require('mongodb').MongoClient;
const asyncWrap = require('../util/asyncWrap');

class MongoDB {

    async connect(host, port, db) {
        try {
            this.client = await asyncWrap([MongoClient,'connect'], `mongodb://${host}:${port}/${db}`);
        }
        catch (ex) {
            console.log(ex);
        }
    }

    async find(collection, filter) {
        if (!this.client)
            return;

        const col = this.client.collection(collection);
        try {
            return await col.find(filter).toArray();
        }
        catch (ex) {
            console.log(ex);
            throw ex;
        }
    }

    async insert(collection, data) {
        if (!this.client)
            return;

        const col = this.client.collection(collection);
        // insert data
        try {
            //return await asyncWrap([ col, 'insert' ], data);
            return await col.insert(data);
        }
        catch (ex) {
            console.log(ex);
            throw ex;
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
            console.error(ex);
            throw ex;
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
            console.error(ex);
            throw ex;
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
            console.log(ex);
            throw ex;
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
            console.log(ex);
            throw ex;
        }
    }

    close() {
        this.client && this.client.close();
    }

}

module.exports = MongoDB;
