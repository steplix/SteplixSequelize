'use strict';

//
// imports
//

const _ = require('lodash');
const P = require('bluebird');
const fs = require('fs');
const async = require('async');
const pluralize = require('pluralize');
const Sequelize = require('sequelize');
const SequelizeAutomate = require('sequelize-automate');
const definition = require('sequelize-automate/src/util/definition');
const Model = require('./model');

//
// constants
//

// Declare for prevent bug on eval
const DataTypes = Sequelize.DataTypes; // eslint-disable-line no-unused-vars
const sequelize = Sequelize; // eslint-disable-line no-unused-vars

// Regular expressions
const regexpDataTypeBinary = /^binary/;
const regexpDataTypeVarbinary = /^varbinary/;

// Check if is necesary persist discover models
const persistEnabled = ['1', 'true'].includes(String(process.env.STEPLIX_SEQUELIZE_PERSISTS_ENABLED).toLowerCase());
const persistPretty = ['1', 'true'].includes(String(process.env.STEPLIX_SEQUELIZE_PERSISTS_PRETTY).toLowerCase());
const persistPath = process.env.STEPLIX_SEQUELIZE_PERSISTS_PATH || '.models';

// Default Options
const defaultOptions = {
    discover: {
        mapping: {},
        models: {},
        fields: {
            logicalDeleteFieldName: 'active'
        }
    },
    dialect: 'mysql'
};

// Model instances
const modelInstances = {};

//
// class
//
class Discoverer {
    constructor (options) {
        this.options = _.defaultsDeep({}, options || {}, defaultOptions);

        if (!this.options.database) {
            throw new Error('Database discoverer need options.database for connect with database.');
        }
        if (!this.options.discover) {
            throw new Error('Database discoverer need options.discover for find definitions of each tables.');
        }

        this.persistEnabled = persistEnabled;
        this.persistPretty = persistPretty;
        this.persistPath = persistPath;

        if (this.options.discover.persist) {
            this.persistEnabled = this.options.discover.persist.enabled /* nil comparation */ != null ? this.options.discover.persist.enabled : this.persistEnabled;
            this.persistPretty = this.options.discover.persist.pretty /* nil comparation */ != null ? this.options.discover.persist.pretty : this.persistPretty;
            this.persistPath = this.options.discover.persist.persistPath || this.persistPath;
        }

        this.data = {
            models: {},
            classes: {}
        };
    }

    /**
     * Discover models
     *
     * @return discovered data
     */
    run () {
        return P.bind(this)
            .then(this.discover)
            .return(this.data);
    }

    /**
     * Discover models
     *
     * @return discovered tables
     */
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
                            .then(table => {
                                return P.bind(this)
                                    .then(() => this.buildModel(table))
                                    .then(() => this.persistModel(table));
                            })
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

    /**
     * Prepare table definition data
     *
     * @return table definition data
     */
    prepareTable (definition, definitions) {
        const table = {};

        // Set table name.
        table.name = definition.tableName;

        // Set model name.
        table.model = definition.modelFileName;

        // Table fields.
        table.fields = _.keys(definition.attributes);

        // Table fields.
        table.attributes = _.mapValues(definition.attributes, field => {
            // Field type
            field.type = this.prepareColumnType(table, field, field.type);

            // Field default value
            field.defaultValue = this.prepareColumnDefaultValue(table, field, field.defaultValue);
            return field;
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

    /**
     * Try to resolve column type
     *
     * @return column sequelize type
     */
    prepareColumnType (table, field, type) {
        try {
            return eval(type); // eslint-disable-line no-eval
        }
        catch (e) {
            try {
                return eval(definition.getDataType(field)); // eslint-disable-line no-eval
            }
            catch (e) {
                try {
                    //
                    // Steplix :: Extend definition.getDataType
                    //
                    const length = type.match(/\(\d+\)/);
                    const typeLength = !_.isNull(length) ? length : '';

                    if (type.match(regexpDataTypeBinary) || type.match(regexpDataTypeVarbinary)) {
                        return `DataTypes.STRING.BINARY${typeLength}`;
                    }
                }
                catch (e) {
                    // eslint-disable-next-line no-console
                    console.warn(`Do you really need to use type [${type}]? varchar fixes everything... lol. Review table ${table.name} - column ${field.field}. steplix-sequelize not support this type`);
                    throw e;
                }
            }
        }
    }

    /**
     * Try to resolve column default value
     *
     * @return column sequelize type
     */
    prepareColumnDefaultValue (table, field, defaultValue) {
        try {
            return eval(defaultValue); // eslint-disable-line no-eval
        }
        catch (e) {
            try {
                return definition.getDefaultValue(field, this.options.database.dialect || 'mysql');
            }
            catch (e) {
                // eslint-disable-next-line no-console
                console.warn(`Do you really need to use default value [${defaultValue}]? Review table ${table.name} - column ${field.field}. steplix-sequelize can't parse this default value`);
            }
        }
        // On eval error, use raw default value
        return defaultValue;
    }

    /**
     * Discover table relationships
     *
     * TODO: Currently we discover the relationships based on the nomenclature of the tables.
     *       The idea would be that they be discovered based on foreign keys.
     *
     * @return table
     */
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

    /**
     * Prepare the model within the instances found. But it only defines it as a property so that its initialization is lazy
     *
     * @return discovered models
     */
    buildModel (table) {
        const models = this.data.models;
        const classes = this.data.classes;
        const sequelize = this.sequelize = this.sequelize || new Sequelize(this.options.database);
        const name = _.upperFirst(table.model);

        // Define getter and setter for model class. This allows to extend the functionality of the model.
        classes[name] = classes[name] || this.options.Model || this.options.database.Model || Model;

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

    /**
     * Persist model on physical JSON file. Only is STEPLIX_SEQUELIZE_PERSISTS_ENABLED=true
     */
    persistModel (table) {
        if (!this.persistEnabled) {
            return P.resolve(this.data.models);
        }

        const recursive = true;

        return P.bind(this)
            .then(() => {
                return new P((resolve, reject) => {
                    fs.access(this.persistPath, (error, exists) => {
                        if (!error || exists) {
                            return resolve();
                        }

                        return fs.mkdir(this.persistPath, { recursive }, error => {
                            if (error) return reject(error);
                            return resolve();
                        });
                    });
                });
            })
            .then(() => {
                return new P((resolve, reject) => {
                    return fs.writeFile(
                        `${this.persistPath}/${table.model}.json`,
                        this.persistPretty ? JSON.stringify(table, null, 2) : JSON.stringify(table),
                        error => {
                            if (error) return reject(error);
                            return resolve();
                        }
                    );
                });
            })
            .return(this.data.models);
    }
}

module.exports = Discoverer;
