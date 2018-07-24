// require express
const express = require('express');
const app = express();
const port = 3000
const fetch = require('node-fetch')
// require graphql
const {
  GraphQLID,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
} = require('graphql');
const graphqlHTTP = require('express-graphql');

// require postgres
const pg = require('pg');
const pgpool = new pg.Pool({ database: 'graphql_postgres_express_demo' });


const apiEndpointType = new GraphQLObjectType({
  name: 'apiEndpoint',
  fields: {
    Model_Name: {
      type: GraphQLString
    },
    Model_ID: {
      type: GraphQLString
    },
  }
});


// set up schema
const userType = new GraphQLObjectType({
  name: 'User',
  fields: {
    id: {
      type: GraphQLID
    },
    username: {
      type: GraphQLString
    },
  }
});

const commentType = new GraphQLObjectType({
  name: 'Comment',
  fields: {
    id: {
      type: GraphQLID
    },
    post_id: {
      type: GraphQLInt
    },
    text: {
      type: GraphQLString
    },
    user: {
      type: userType,
      resolve: (obj) => {
        return pgpool.query(`
          SELECT * FROM users
          WHERE id = $1
        `, [obj.user_id]).then((result) => result.rows[0]);
      }
    },
  }
});

const postType = new GraphQLObjectType({
  name: 'Post',
  fields: {
    id: {
      type: GraphQLID
    },
    title: {
      type: GraphQLString
    },
    comments: {
      type: new GraphQLList(commentType),
      args: {
        limit: {
          type: GraphQLInt
        },
        search: {
          type: GraphQLString
        }
      },
      resolve: (obj, args) => {
        return pgpool.query(`
          SELECT * FROM comments
          WHERE post_id = $1 AND (text ~ $3 OR $3 IS NULL) 
          LIMIT $2
        `, [obj.id, args.limit, args.search]).then((result) => result.rows);
      }
    },
  }
});

const schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'RootQuery',
    fields: {
      post: {
        type: postType,
        args: {
          id: {
            type: GraphQLInt
          },
          search: {
            type: new GraphQLNonNull(GraphQLString)
          }
        },
        resolve: (obj, args) => {
          return pgpool.query(`
            SELECT * FROM posts
            WHERE id = $1 OR title ~ $2
          `, [args.id, args.search]).then((result) => result.rows[0]);
        }
      },
      posts: {
        type: new GraphQLList(postType),
        resolve: () => {
          return pgpool.query(`
            SELECT * FROM posts
          `, []).then((result) => result.rows);
        }
      },
      users: {
        type: new GraphQLList(userType),
        resolve: () => {
          return pgpool.query(`
            SELECT * FROM users
          `, []).then((result) => result.rows);
        }
      },
      apiEndpoint: {
        type: new GraphQLList(apiEndpointType),
        args: {
          make: {
            type: new GraphQLNonNull(GraphQLString)
          },
          model: {
            type: GraphQLString
          }
        },
        resolve: (obj, args) => {
          return fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/getmodelsformake/${args.make}?format=json`)
              .then(response => response.json())
              .then(json => {
                return json.Results.filter(e=>args.model ? e.Model_Name.toLowerCase().includes(args.model.toLowerCase()) : e)
              })
          
        }
      },
    },
  }),
});

// set up express
app.use('/', graphqlHTTP({
  schema: schema,
  graphiql: true,
}));

app.listen(port, () => {
  console.log(`express is running... on port ${port}`);
});
