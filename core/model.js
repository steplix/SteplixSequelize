'use strict';

const _ = require('lodash');
const P = require('bluebird');
const async = require('async');
const Sequelize = require('sequelize');
const pluralize = require('pluralize');

const omitOptions = ['attributes', 'where', 'order', 'group', 'limit', 'offset'];
const defaultFieldId = 'id';
const defaultWriteOptions = {};
const defaultReadOptions = {
    raw: true,
    cache: true,
    populate: true,
    transform: true
};

// Remove previous value.
function _unset (object, property, newlyProperty = null) {
    // Check if original attribute name if a nested attribute name.
    // Example:
    //    price is original attribute name
    //    price.value is copy attribute name
    //    We does not need delete the original attribute
    if (newlyProperty && property.indexOf('.') === -1) {
        if (!newlyProperty.split('.').includes(property)) {
            _.unset(object, property);
        }
        return;
    }

    // The original attribute name is a nested attribute name.
    _.unset(object, property);

    const parts = property.split(/\./).reverse();
    let history = '';

    parts.forEach((part, index) => {
        history = `${(index + 1) === parts.length ? '' : '.'}${part}` + history;

        const name = property.replace(history, '');

        if (name && _.isEmpty(_.get(object, name))) {
            return _.unset(object, name);
        }
        return false;
    });
}

class Model {
    constructor (options) {
        this.options = options || {};

        if (!this.options.sequelize || !this.options.model || !this.options.attributes) {
            throw new Error(`The model ${this.options.model} is not correctly configured`);
        }

        this.name = this.options.model;
        this.sequelize = this.options.sequelize;
        this.connection = this.sequelize.define(this.options.name, this.options.attributes, this.options.options);
    }

    find (options) {
        const opts = this.prepareReadOptions(options);

        opts.attributes = opts.attributes || [defaultFieldId];

        // Select models
        return this.connection.findAll(opts).then(models => {
            // Prevent unnecesary map models
            if (opts.unfilled || !models || !models.length) return models;

            // Map all finded models
            return this.mapping(models, defaultFieldId, _.omit(opts, omitOptions));
        });
    }

    getById (id, field, options) {
        // Prepare arguments
        if (_.isObject(field)) {
            options = field;
            field = defaultFieldId;
        }
        if (!_.isString(field)) {
            field = defaultFieldId;
        }

        const opts = this.prepareReadOptions(options);

        // Prepare where condition
        opts.where = opts.where || {};
        opts.where[field] = id;

        return this.getOne(opts);
    }

    getOne (options) {
        const opts = this.prepareReadOptions(options);

        return this.connection.findOne(opts).then(model => {
            // Check if model not need population
            if (!model || !opts.populate || opts.unfilled) {
                return model;
            }

            // If no unfilled model, populate necesary data
            return this.populate(model, _.omit(opts, omitOptions));
        });
    }

    create (data, options) {
        return this.connection.create(data, this.prepareWriteOptions(options));
    }

    update (data, id, field, options) {
        // Prepare arguments
        if (_.isObject(field)) {
            options = field;
            field = defaultFieldId;
        }
        if (!_.isString(field)) {
            field = defaultFieldId;
        }

        const opts = this.prepareWriteOptions(options);

        // Prepare where condition
        opts.where = opts.where || {};
        opts.where[field] = id;

        return this.connection.update(data, opts).then(result => {
            // Prevent unnecesary map results
            if (opts.raw || !result) return result;

            return this.find(opts).then(models => {
                if (models && models.length && models.length === 1) {
                    return models[0];
                }
                return models;
            });
        });
    }

    destroy (id, field, options) {
        // Prepare arguments
        if (_.isObject(field)) {
            options = field;
            field = defaultFieldId;
        }
        if (!_.isString(field)) {
            field = defaultFieldId;
        }

        const opts = this.prepareWriteOptions(options);

        // Prepare where condition
        opts.where = opts.where || {};
        opts.where[field] = id;

        return this.connection.destroy(opts);
    }

    count (options) {
        const opts = this.prepareReadOptions(options);

        return this.connection.count(opts);
    }

    exist (options) {
        return this.count(options).then(count => (count || 0) > 0);
    }

    store (query, options) {
        return this.sequelize.query(query, options);
    }

    query (query, options) {
        const opts = options || {};

        opts.type = opts.type || Sequelize.QueryTypes.SELECT;
        return this.sequelize.query(query, opts);
    }

    queryOne (query, options) {
        return this.query(query, options).then(results => _.first(results || []));
    }

    transaction (callback) {
        return this.sequelize.transaction(callback);
    }

    prepareReadOptions (options) {
        return _.defaults({}, options || {}, defaultReadOptions);
    }

    prepareWriteOptions (options) {
        return _.defaults({}, options || {}, defaultWriteOptions);
    }

    literal (value) {
        return Sequelize.literal(value);
    }

    mapping (models, field, args, options) {
        if (_.isEmpty(models)) {
            return models;
        }

        if (_.isObject(args)) {
            options = args;
            args = [];
        }

        options = options || {};
        args = args || [];

        return new P((resolve, reject) => {
            async.map(models, (model, next) => {
                return this.getById.apply(this, [model[field]].concat(args).concat([options])).then(model => {
                    return P.resolve(next(null, model));
                });
            }, (error, models) => {
                if (error) return reject(error);
                return resolve(models);
            });
        });
    }

    populate (model, options) {
        return P.bind(this)
            .then(() => this.populateOne(model, options))
            .then(() => this.populateMany(model, options))
            .then(() => this.populateProperties(model, options));
    }

    populateOne (model, options) {
        options = options || {};

        // Check if only need model (tiny) or not has one to one relationships
        if (options.tiny || _.isEmpty(this.options.relationships.one)) {
            return P.resolve(model);
        }

        const entity = this.options.nomenclature.relationship;

        return P.each(this.options.relationships.one, child => {
            // Build property name. Ex. child = 'device_brands' singularized = 'device_brand'
            const property = pluralize.singular(child);
            const idField = `id_${property}`;
            const id = model[idField];

            if (!id || (options.without && (options.without.includes(entity) || options.without.includes(property)))) {
                delete model[idField];
                return model;
            }

            const relationships = options.relationships || {};
            const opts = _.merge({}, relationships[property] || {}, {
                without: [entity]
            });

            if (options.without) {
                opts.without = options.without.concat(opts.without);
            }

            const childModel = this.models[_.camelCase(child)];

            if (!childModel) {
                return model;
            }
            return childModel.getById(id, opts).then(result => {
                if (result) {
                    model[property.replace(`${entity}_`, '')] = result;
                    delete model[idField];
                }
                return model;
            });
        })
            .return(model);
    }

    populateMany (model, options) {
        options = options || {};

        // Check if only need model (tiny) or not has one to many/many to one relationships.
        if (options.tiny || _.isEmpty(this.options.relationships.many)) {
            return P.resolve(model);
        }

        const entity = this.options.nomenclature.relationship;

        return P.each(this.options.relationships.many, child => {
            child = _.camelCase(child);

            const property = _.camelCase(child.replace(entity, ''));

            if (options.without && options.without.includes(property)) {
                return model;
            }

            const relationships = options.relationships || {};
            const idField = `id_${entity}`;
            const opts = _.merge({}, relationships[property] || {}, {
                where: {
                    [idField]: model.id
                },
                without: [entity]
            });

            const childModel = this.models[child];

            if (!childModel) {
                return model;
            }
            return childModel.find(opts).then(results => {
                if (results) {
                    model[property] = _.map(results, result => {
                        delete result[idField];
                        return result;
                    });
                }
                return model;
            });
        })
            .return(model);
    }

    populateProperties (model, options) {
        options = options || {};

        // Check if need raw model.
        if (!options.transform) {
            return P.resolve(model);
        }

        // Apply casting
        if (!_.isEmpty(this.options.cast) || !_.isEmpty(options.cast)) {
            _.each((this.options.cast || []).concat(options.cast || []), (property, caster) => {
                const value = caster(_.get(model, property), property, model);

                if (!_.isNil(value)) {
                    _.set(model, property, value);
                }
            });
        }
        // Apply rename
        if (!_.isEmpty(this.options.rename) || !_.isEmpty(options.rename)) {
            _.each((this.options.rename || []).concat(options.rename || []), (as, property) => {
                const value = _.get(model, property);

                if (!_.isNil(value)) {
                    _.set(model, as, value);
                }
                _unset(model, property, as);
            });
        }
        // Apply hidden
        if (!_.isEmpty(this.options.hidden) || !_.isEmpty(options.hidden)) {
            _.each((this.options.hidden || []).concat(options.hidden || []), property => {
                _unset(model, property);
            });
        }
        return model;
    }
}

module.exports = Model;
