'use strict';

const _ = require('lodash');
const P = require('bluebird');
const async = require('async');
const pluralize = require('pluralize');
const Sequelize = require('sequelize');
const SequelizeAutomate = require('sequelize-automate');
const Model = require('./model');
const DataTypes = Sequelize.DataTypes; // eslint-disable-line no-unused-vars
const sequelize = Sequelize; // eslint-disable-line no-unused-vars

const defaultOptions = {
    discover: {
        mapping: {},
        models: {},
        fields: {
            logicalDeleteFieldName: 'active'
        }
    }
};

const modelInstances = {};

class Discoverer {
    constructor (options) {
        this.options = _.defaultsDeep({}, options || {}, defaultOptions);

        if (!this.options.database) {
            throw new Error('Database discoverer need options.database for connect with database.');
        }
        if (!this.options.discover) {
            throw new Error('Database discoverer need options.discover for find definitions of each tables.');
        }

        this.data = {
            models: {},
            classes: {}
        };
    }

    run () {
        return P.bind(this)
            .then(this.discover)
            .return(this.data);
    }

    discover () {
        this.automate = new SequelizeAutomate(this.options.database || this.options.db, this.options.discover);

        return P.bind(this)
            // Find all table sequelize definitions on the database.
            .then(() => this.automate.getDefinitions())
            // Make table object of each definition.
            .then(definitions => {
                return new P((resolve, reject) => {
                    async.reduce(definitions, {}, (carry, definition, next) => {
                        // Prepare table scheme.
                        return P.bind(this)
                            // Prepare table scheme and find relationships, this will resolve all related tables (ex. 'users' > many > ['user_attributes'])
                            .then(() => this.prepareTable(definition, definitions))
                            // Save table on carry.
                            .then(table => {
                                carry[table.name] = table;
                                return table;
                            })
                            // Build model.
                            .then(table => this.buildModel(table))
                            .then(() => P.resolve(next(null, carry)))
                            .catch(next);
                    }, (error, tables) => {
                        if (error) return reject(error);

                        this.data.tables = tables;
                        return resolve(tables);
                    });
                });
            })
            .return(this.data.tables);
    }

    prepareTable (definition, definitions) {
        const table = {};

        // Set table name.
        table.name = definition.tableName;

        // Set model name.
        table.model = definition.modelFileName;

        // Table fields.
        table.fields = _.keys(definition.attributes);

        // Table fields.
        table.attributes = _.mapValues(definition.attributes, attribute => {
            // TODO Optimize this step.
            attribute.type = eval(attribute.type); // eslint-disable-line no-eval
            attribute.defaultValue = eval(attribute.defaultValue); // eslint-disable-line no-eval
            return attribute;
        });

        // Table indexes.
        table.indexes = definition.indexes;

        // Define all table nomemclature
        table.nomenclature = {
            table: table.name,
            model: table.model,
            title: _.startCase(pluralize.singular(table.name)),
            relationship: pluralize.singular(table.name)
        };

        // Checking if options.fields.logicalDeleteFieldName attribute exists. In that case, deletion method will be by boolean.
        table.logicalDelete = {
            enabled: table.fields.includes(this.options.discover.fields.logicalDeleteFieldName),
            fieldName: this.options.discover.fields.logicalDeleteFieldName
        };

        // Get the children: this will find all related tables (ex. 'users' > ['user_attributes'])
        table.children = _.map(_.filter(definitions, definition => _.startsWith(definition.tableName, `${table.nomenclature.relationship}_`)), 'tableName');

        // Resolve table options (hidden, cast, rename)
        if (this.options.discover.models[table.model]) {
            if (this.options.discover.models[table.model].hidden) {
                table.hidden = this.options.discover.models[table.model].hidden;
            }
            if (this.options.discover.models[table.model].cast) {
                table.cast = this.options.discover.models[table.model].cast;
            }
            if (this.options.discover.models[table.model].rename) {
                table.rename = this.options.discover.models[table.model].rename;
            }
        }

        // Discover relationships
        return P.bind(this)
            .then(() => this.discoverRelationships(table, definitions))
            .return(table);
    }

    discoverRelationships (table, definitions) {
        const id = `id_${table.nomenclature.relationship}`;

        table.relationships = {};

        return P.bind(this)
            // Get relationships: this will understand if each related table is 1:1 or 1:N extension
            .then(() => {
                return P.each(table.children, child => {
                    const definition = _.find(definitions, ['tableName', child]);

                    // Check if is exist definition.
                    if (!definition) {
                        return table.relationships;
                    }

                    // Check if is many relationship.
                    if (definition.attributes[id]) {
                        table.relationships.many = table.relationships.many || [];
                        table.relationships.many.push(child);
                    }
                    else {
                        table.relationships.one = table.relationships.one || [];
                        table.relationships.one.push(child);
                    }
                    return table.relationships;
                });
            })
            // Get relationships: this will get 1:1 external relationships (ex. 'users' > ['roles'])
            .then(() => {
                return P.each(table.fields, field => {
                    if (_.startsWith(field, 'id_') && !field.includes(table.nomenclature.relationship)) {
                        table.relationships.one = table.relationships.one || [];

                        // 'id_role' > 'roles'
                        let child = pluralize.plural(field.slice(3));

                        // Resolve child table mapping
                        if (this.options.discover.mapping[child]) {
                            child = this.options.discover.mapping[child];
                        }
                        table.relationships.one.push(child);
                    }
                    return table.relationships;
                });
            })
            .return(table);
    }

    buildModel (table) {
        const models = this.data.models;
        const classes = this.data.classes;
        const sequelize = this.sequelize = this.sequelize || new Sequelize(this.options.database);
        const name = _.upperFirst(table.model);

        // Define getter and setter for model class. This allows to extend the functionality of the model.
        classes[name] = classes[name] || Model;

        // Define getter for model instance. This allows the instantiation of the model to be lazy.
        Object.defineProperty(models, name, {
            configurable: true,
            enumerable: true,
            get: function () {
                let instance = modelInstances[name];

                if (!instance) {
                    table.sequelize = sequelize;
                    instance = modelInstances[name] = new (classes[name])(table);
                    instance.models = models;
                }
                return instance;
            },
            set: function (classModel) {
                classes[name] = classModel;
            }
        });

        return P.resolve(models);
    }
}

module.exports = Discoverer;
