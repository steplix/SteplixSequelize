'use strict';

const _ = require('lodash');
const P = require('bluebird');
const async = require('async');
const Sequelize = require('sequelize');
const pluralize = require('pluralize');

const pickOptions = ['with', 'without', 'transaction'];
const omitOptions = ['attributes', 'where', 'order', 'group', 'limit', 'offset'];
const defaultFieldId = 'id';
const defaultWriteOptions = {
    useMaster: true
};
const defaultReadOptions = {
    raw: true,
    tiny: true,
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

        if (!opts.attributes) {
            opts.attributes = ['*'];
        }

        // Select models
        return this.connection.findAll(opts).then(models => {
            // Prevent unnecesary map models
            if (!opts.populate || opts.unfilled || !models || !models.length) return models;

            // Map all finded models
            return this.mappingAll(models, _.omit(opts, omitOptions));
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
            return this.mappingOne(model, _.omit(opts, omitOptions));
        });
    }

    create (data, options) {
        const opts = this.prepareWriteOptions(options);

        return this.connection.create(data, opts).then(result => {
            // Prevent unnecesary map results
            if (opts.raw || !result || !result.id) return result;

            return this.getById(result.id, opts);
        });
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

    query (query, options = {}) {
        const type = options.type || Sequelize.QueryTypes.SELECT;
        const opts = (type === Sequelize.QueryTypes.SELECT) ? this.prepareReadOptions(options) : options;

        opts.type = opts.type || Sequelize.QueryTypes.SELECT;

        return this.sequelize.query(query, opts).then(models => {
            // Prevent unnecesary map models
            if (!opts.populate || opts.unfilled || !models || !models.length) return models;

            // Map all finded models
            return this.mappingAll(models, _.omit(opts, omitOptions));
        });
    }

    queryOne (query, options = {}) {
        options.limit = 1;
        return this.query(query, options).then(results => _.first(results || []));
    }

    transaction (callback) {
        return this.sequelize.transaction(callback);
    }

    prepareReadOptions (options) {
        return _.defaults({}, options || {}, this.options.readOptions || {}, defaultReadOptions);
    }

    prepareWriteOptions (options) {
        return _.defaults({}, options || {}, this.options.writeOptions || {}, defaultWriteOptions);
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
                return this.getById.apply(this, [model[field]].concat(args).concat([options]))
                    .then(model => P.resolve(next(null, model)))
                    .catch(next);
            }, (error, models) => {
                if (error) return reject(error);
                return resolve(models);
            });
        });
    }

    mappingAll (models, options) {
        if (_.isEmpty(models)) {
            return models;
        }

        return new P((resolve, reject) => {
            async.map(models, (model, next) => {
                return this.mappingOne(model, options)
                    .then(model => P.resolve(next(null, model)))
                    .catch(next);
            }, (error, models) => {
                if (error) return reject(error);
                return resolve(models);
            });
        });
    }

    mappingOne (model, options) {
        if (!model) {
            return P.resolve(model);
        }
        return this.populate(model, options);
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
        if ((options.tiny && !options.with) || _.isEmpty(this.options.relationships.one)) {
            return P.resolve(model);
        }

        const entity = this.options.nomenclature.relationship;

        return P.each(this.options.relationships.one, child => {
            // Build property name. Ex. child = 'device_brands' singularized = 'device_brand'
            const property = pluralize.singular(child);
            const propertySimplify = property.replace(`${entity}_`, '');
            const idField = `id_${property}`;
            const id = model[idField];

            // Check if exists id relationship.
            if (!id) {
                return model;
            }

            // Check if not need load relationship.
            if (options.without && (options.without.includes(property) || options.without.includes(propertySimplify))) {
                return model;
            }

            // Check if not need load relationship.
            if (options.hidden && (options.hidden.includes(property) || options.hidden.includes(propertySimplify))) {
                delete model[idField];
                delete model[property];
                delete model[propertySimplify];
                return model;
            }

            // Check if need load relationship.
            if (options.tiny && options.with && !(this.hasProperty(options.with, property) || this.hasProperty(options.with, propertySimplify))) {
                return model;
            }

            // Check if model child exist.
            const childModel = this.models[_.upperFirst(_.camelCase(child))];

            if (!childModel) {
                return model;
            }

            // Check relationship options
            const relationships = options.relationships || {};
            const relationship = relationships[property] || relationships[propertySimplify] || {};
            const realProperty = relationships[property] ? property : (relationships[propertySimplify] ? propertySimplify : property);
            let opts = _.merge({}, relationship, _.pick(options, pickOptions));

            opts.without = opts.without || [];
            opts.without.push(entity);

            opts = this.prepareRelationshipOptions(opts, relationship, realProperty);

            return childModel.getById(id, opts).then(result => {
                // Check relationship result.
                if (result) {
                    model[propertySimplify] = result;
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
        if ((options.tiny && !options.with) || _.isEmpty(this.options.relationships.many)) {
            return P.resolve(model);
        }

        const entity = this.options.nomenclature.relationship;

        return P.each(this.options.relationships.many, child => {
            child = _.camelCase(child);

            // Build property name. Ex. child = 'device_brands' singularized = 'device_brand'
            const property = _.camelCase(child.replace(entity, ''));

            // Check if not need load relationship.
            if (options.without && options.without.includes(property)) {
                return model;
            }

            // Check if not need load relationship.
            if (options.hidden && options.hidden.includes(property)) {
                delete model[property];
                return model;
            }

            // Check if need load relationship.
            if (options.tiny && options.with && !this.hasProperty(options.with, property)) {
                return model;
            }

            // Check if model child exist.
            const childModel = this.models[_.upperFirst(child)];

            if (!childModel) {
                return model;
            }

            // Check relationship options
            const relationship = (options.relationships || {})[property] || {};
            const idField = `id_${entity}`;
            let opts = _.merge({}, relationship, _.pick(options, pickOptions));

            opts.where = opts.where || {};
            opts.where[idField] = model.id;

            opts.without = opts.without || [];
            opts.without.push(entity);

            opts = this.prepareRelationshipOptions(opts, relationship, property);

            return childModel.find(opts).then(results => {
                // Check relationship results.
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
            _.each(_.merge({}, this.options.cast || {}, options.cast || {}), (property, caster) => {
                const value = caster(_.get(model, property), property, model);

                if (!_.isNil(value)) {
                    _.set(model, property, value);
                }
            });
        }
        // Apply rename
        if (!_.isEmpty(this.options.rename) || !_.isEmpty(options.rename)) {
            _.each(_.merge({}, this.options.rename || {}, options.rename || {}), (as, property) => {
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

    hasProperty (properties, property) {
        return !!_.find(properties, prop => {
            if (prop.includes('.')) {
                return _.startsWith(prop, property);
            }
            return prop === property;
        });
    }

    prepareRelationshipOptions (options, relationship, key) {
        options = options || {};

        if (!_.isEmpty(relationship)) {
            // "With" include relationship properties
            if (relationship.with) {
                options.with = _.uniq((options.with || []).concat(relationship.with));
            }
            // "Without" does not remove relationship properties
            if (relationship.without) {
                options.without = _.uniq((options.without || []).concat(relationship.without));
            }
            // "Hidden" remove relationship properties
            if (relationship.hidden) {
                options.hidden = _.uniq((options.hidden || []).concat(relationship.hidden));
            }
            // "Rename" include relationship properties
            if (relationship.rename) {
                options.rename = _.merge({}, (options.rename || {}), relationship.rename);
            }
            // "Cast" include relationship properties
            if (relationship.cast) {
                options.cast = _.merge({}, (options.cast || {}), relationship.cast);
            }
            // "Tiny" relationship properties
            if (relationship.tiny) {
                options.tiny = true;
            }
        }
        else {
            const modelOptionRegExp = new RegExp(`${key}\.`, 'i');
            const getRelationshipOptions = (options) => {
                const replaced = _.map(options, (element) => {
                    if (modelOptionRegExp.test(element)) { return element.replace(modelOptionRegExp, ''); }
                });
                return _.compact(replaced);
            };

            // "With" included in options.with='account.*'
            if (options.with) {
                const withOpts = getRelationshipOptions(options.with);
                if (withOpts.length) options.with = withOpts;
            }
            // "Without" included in options.without='account.*'
            if (options.without) {
                const withoutOpts = getRelationshipOptions(options.without);
                if (withoutOpts.length) options.without = withoutOpts;
            }
            // "Hidden" included in options.hidden='account.*'
            if (options.hidden) {
                const hiddenOpts = getRelationshipOptions(options.hidden);
                if (hiddenOpts.length) options.hidden = hiddenOpts;
            }
        }
        return options;
    }
}

module.exports = Model;
