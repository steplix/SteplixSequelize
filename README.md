# Steplix Sequelize

Steplix Sequelize is an adapter promise-based Node.js ORM autodiscover.

## Index

* [Download & Install][install].
* [How is it used?][how_is_it_used].
* [Tests][tests].

## Download & Install

### NPM
```bash
$ npm install steplix-sequelize
```

### Source code
```bash
$ git clone https://github.com/steplix/SteplixSequelize.git
$ cd SteplixSequelize
$ npm install
```

## How is it used?

### Create new **Database** instance.

```js
const { Database } = require('steplix-sequelize');
// For more information of Database connections. See: https://sequelize.org/master/class/lib/sequelize.js~Sequelize.html#instance-constructor-constructor
const db = new Database({
  host: 'localhost',
  username: 'myuser',
  password: 'mypass',
  database: 'mydbname'
});

// Autodiscover models on database
db.discover().then(() => {
  return db.models.users.getById(1);
})
```

#### Simple query Execution
```js
db.query(/* YOUR SQL QUERY */).then(/* array */ result => /*...*/).catch(/*...*/);
```

#### Query for one result
```js
db.queryOne(/* YOUR SQL QUERY */).then(/* object|undefined */ result => /*...*/).catch(/*...*/);
```

#### Handle transaction

This function is automatically responsible for `commit` or `rollback` (as appropriate).
The `commit` will be performed once the `callback` function received as an argument is finished. In case the `callback` function returns a promise, the commit will be made at the end of this promise.
In case of any failure, a `rollback` will be performed automatically (even if the `commit` fails).

```js
db.transaction(/* callback */ transaction => {
  return db
    .query(/* FIRST SQL QUERY */, { transaction })
    .then(/* array */ result => {
      return db.query(/* SECOND SQL QUERY */, { transaction }).then(/*...*/);
    });
})
.catch(/*...*/);
```

#### Check if database connection found
```js
db.isAlive().then(/* boolean */ alive => /*...*/).catch(/*...*/);

// OR

db.ping().then(/* boolean */ alive => /*...*/).catch(/*...*/);
```

#### End connection
```js
db.end().then(/*...*/).catch(/*...*/);
```

### Create new **Model** instance.

```js
const { DataTypes } = require('sequelize');
const { Model } = require('steplix-sequelize');
const model = new Model(/* model name */ 'users', /* model definition */ {
  columnA: {
      type: DataTypes.BOOLEAN,
      validate: {
        is: ['[a-z]','i'],
        max: 23,
        isIn: {
          args: [['en', 'zh']],
          msg: 'Must be English or Chinese'
        }
      },
      field: 'column_a'
  },
  columnB: DataTypes.STRING,
  columnC: 'MY VERY OWN COLUMN TYPE'
} /* , sequelize options */);
```

#### Find models
```js
const options = {
  where: {
    id: 1,
    deleted_at: {
      $is: null
    }
  },
  order: [['id', 'DESC'], ['created_at', 'ASC']],
  offset: 10,
  limit: 10
};

model.find(options).then(/* array */ models => /*...*/).catch(/*...*/);

// ------------------------------------------------------------------------------------

const options = {
  fields: ['id', 'active'],
  where: {
    OR: {
      deleted_at: {
        $is: null,
        $gt: '2019-06-01 00:00:00'
      }
    }
  }
};

model.find(options).then(/* array */ models => /*...*/).catch(/*...*/);
```

#### Get by ID
```js
model.getById(1).then(/* object|undefined */ model => /*...*/).catch(/*...*/);
```

#### Get one
```js
const options = {
  where: {
    id: {
      $in: [1, 2, 3]
    }
  }
};

model.getOne(options).then(/* object|undefined */ model => /*...*/).catch(/*...*/);
```

#### Exist
```js
const options = {
  where: {
    id: 1
  }
};

model.exist(options).then(/* boolean */ exist => /*...*/).catch(/*...*/);
```

#### Count
```js
const options = {
  where: {
    active: 1
  }
};

model.count(options).then(/* number */ total => /*...*/).catch(/*...*/);
```

#### Insert new model
```js
const data = {
  id: null,
  active: 1,
  created_at: Model.literal('NOW()'),
  updated_at: null
};

model.create(data).then(/* object */ model => /*...*/).catch(/*...*/);
```

#### Update existing model
```js
const data = {
  active: 0,
  updated_at: Model.literal('NOW()')
};

model.update(data, /* ID value */ 1).then(/* object */ model => /*...*/).catch(/*...*/);

// Or update more rows

const data = {
  active: 1
};

model.update(data, /* All disactive rows */ 0, /* Reference field name */ 'active').then(/* array */ models => /*...*/).catch(/*...*/);
```

#### Delete model
```js
model.destroy(/* ID value */ 1).then(/* number */ result => /*...*/).catch(/*...*/);
```

#### Handle transaction

This function is automatically responsible for `commit` or `rollback` (as appropriate).
The `commit` will be performed once the `callback` function received as an argument is finished. In case the `callback` function returns a promise, the commit will be made at the end of this promise.
In case of any failure, a `rollback` will be performed automatically (even if the `commit` fails).

```js
model.transaction(/* callback */ transaction => {
  const options = {
    transaction,
    where: {
      username: 'myusername'
    }
  };

  return model
    .exist(options)
    .then(exist => {
      if (exist) return model.update(data, 'myusername', 'username', { transaction });
      return model.create(data, { transaction });
    })
    .then(result => model.getById(result.id, { transaction }));
})
.catch(/*...*/);
```

## Tests

In order to see more concrete examples, **I INVITE YOU TO LOOK AT THE TESTS :)**

### Run the unit tests
```bash
npm install
npm test
```

<!-- deep links -->
[install]: #download--install
[how_is_it_used]: #how-is-it-used
[tests]: #tests
