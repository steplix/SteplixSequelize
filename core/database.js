'use strict';

const _ = require('lodash');
const P = require('bluebird');
const Sequelize = require('sequelize');
const Autodiscover = require('./autodiscover');

const defaultOptions = {
    dialect: 'mysql',
    logging: false,
    port: 3306,
    define: {
        paranoid: false,
        timestamps: false,
        underscored: false,
        freezeTableName: false,
        charset: 'utf8',
        timezone: '+03:00',
        dialectOptions: {
            collate: 'utf8_general_ci'
        }
    }
};

const defaultDiscoverOptions = {
    type: 'js',
    fileNameCamelCase: true
};

class Database {
    constructor (options = {}) {
        this.options = _.defaultsDeep({}, options, defaultOptions);
        this.connection = new Sequelize(this.options);
    }

    query (query, options) {
        options = options || {};
        options.type = options.type || Sequelize.QueryTypes.SELECT;
        return this.connection.query(query, options);
    }

    queryOne (query, options = {}) {
        options.limit = 1;
        return this.query(query, options).then(results => {
            let result;

            if (results && results.length) {
                result = results[0];
            }
            return P.resolve(result);
        });
    }

    transaction (callback) {
        return this.connection.transaction(callback);
    }

    isAlive () {
        return this.connection.authenticate().then(() => true);
    }

    ping () {
        return this.isAlive();
    }

    end () {
        return P.resolve(this.connection.close());
    }

    discover (options = {}) {
        const discover = new Autodiscover({
            database: this.options,
            discover: _.defaultsDeep({}, options, this.options.discover || {}, defaultDiscoverOptions)
        });

        return discover
            .run()
            .then(data => {
                this.tables = data.tables;
                this.models = data.models;
                return this;
            });
    }
}

module.exports = Database;
