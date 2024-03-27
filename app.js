const express = require('express')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const path = require('path')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const app = express()
app.use(express.json())

const dbPath = path.join(__dirname, 'twitterClone.db')

let db = null

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server Started')
    })
  } catch (e) {
    console.log(`DB ERROR: ${e.message}`)
    process.exit(1)
  }
}
initializeDBAndServer()

// API 1 POST METHOD;
app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body

  const getUSerQuery = `SELECT * FROM user WHERE username = '${username}'`

  const getUser = await db.get(getUSerQuery)

  if (getUser !== undefined) {
    response.status(400)
    response.send('User already exists')
  } else {
    if (password.length < 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const hashedPassword = await bcrypt.hash(password, 10)
      const createUserQuery = `
            INSERT INTO 
            user(username,password,name,gender)
            VALUES (
                '${username}',
                '${hashedPassword}',
                '${name}',
                '${gender}')`

      const createUser = await db.run(createUserQuery)
      response.status(200)
      response.send('User created successfully')
    }
  }
})

// API 2 POST METHOD:
app.post('/login/', async (request, response) => {
  const {username, password} = request.body

  const getUSerQuery = `SELECT * FROM user WHERE username = "${username}"`

  const userDetails = await db.get(getUSerQuery)

  if (userDetails !== undefined) {
    const isPasswordMatch = await bcrypt.compare(password, userDetails.password)
    if (isPasswordMatch) {
      const payload = {username, userId: userDetails.user_id}
      const jwtToken = jwt.sign(payload, 'SECRET TOKEN')

      response.send({jwtToken})
    } else {
      response.status('400')
      response.send('Invalid password')
    }
  } else {
    response.status(400)
    response.send('Invalid user')
  }
})

// Authentication with Token

const authenticateToken = (request, response, next) => {
  let jwtToken

  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'SECRET TOKEN', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        request.userId = payload.userId
        next()
      }
    })
  }
}

const getFollowingPeopleIdOfUser = async username => {
  const getFollowingPeopleQuery = `
  SELECT following_user_id 
  FROM follower
  INNER JOIN user 
  ON user.user_id = follower.follower_user_id 
  WHERE user.username = '${username}'`

  const followingPeople = await db.all(getFollowingPeopleQuery)
  // console.log(followingPeople)
  const arrayOfIds = followingPeople.map(eachUser => {
    return eachUser.following_user_id
  })
  return arrayOfIds
}

// API 3 GET METHOD;
app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  const {username} = request
  // console.log(username)

  const followingPeopleId = await getFollowingPeopleIdOfUser(username)
  // console.log(followingPeopleId)

  const getTweetsQuery = `
  SELECT username, tweet, date_time as dateTime 
  FROM user 
  INNER JOIN tweet 
  ON user.user_id = tweet.user_id
  WHERE user.user_id IN (${followingPeopleId})
  ORDER BY date_time DESC
  LIMIT 4;`

  const getTweets = await db.all(getTweetsQuery)
  response.send(getTweets)
})

// API 4 GET METHOD;
app.get('/user/following/', authenticateToken, async (request, response) => {
  const {username, userId} = request

  const getFollowingPerson = `
     SELECT name from user
     INNER JOIN follower
     ON user.user_id = follower.following_user_id
     WHERE follower_user_id = ${userId}`

  const followingPerson = await db.all(getFollowingPerson)
  response.send(followingPerson)
})

// API 5 GET METHOD;
app.get('/user/followers/', authenticateToken, async (request, response) => {
  const {username, userId} = request

  const getFollowersPerson = `
     SELECT name from user
     INNER JOIN follower
     ON user.user_id = follower.follower_user_id
     WHERE following_user_id = ${userId}`

  const followersPerson = await db.all(getFollowersPerson)
  response.send(followersPerson)
})

// twitter access authentication

const tweetAccessAuthentication = async (request, response, next) => {
  const {tweetId} = request.params
  const {userId} = request

  const getUserFollowingQuery = `
  SELECT *
  FROM tweet
  INNER JOIN follower
  ON tweet.user_id = follower.following_user_id
  WHERE tweet.tweet_id =${tweetId} AND follower.follower_user_id =${userId}`

  const userFollowing = await db.get(getUserFollowingQuery)

  if (userFollowing === undefined) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    next()
  }
}

// API 6 GET METHOD;
app.get(
  '/tweets/:tweetId/',
  authenticateToken,
  tweetAccessAuthentication,
  async (request, response) => {
    const {tweetId} = request.params

    const getTweetRequest = `
      SELECT tweet, count(reply_id) AS replies, date_time AS dateTime
      FROM tweet
      INNER JOIN reply ON tweet.tweet_id = reply.tweet_id
      WHERE tweet.tweet_id = ${tweetId}`

    const data = await db.get(getTweetRequest)

    const getLikes = `
    SELECT count(like_id) AS likes
    FROM like
    WHERE tweet_id = ${tweetId}`

    const {likes} = await db.get(getLikes)
    // console.log(likes)
    data.likes = likes
    response.send(data)

    // const getTweetRequest = `SELECT
    //  tweet,
    // (SELECT COUNT(*) FROM like WHERE tweet_id = ${tweetId}) AS likes,
    // (SELECT COUNT(*) FROM reply WHERE tweet_id = ${tweetId}) AS replies,
    // date_time AS dateTime
    // FROM
    // tweet
    // WHERE
    // tweet_id = ${tweetId};`

    // const getTweet = await db.get(getTweetRequest)
    // response.send(getTweet)
  },
)

// API 7 GET METHOD;
app.get(
  '/tweets/:tweetId/likes/',
  authenticateToken,
  tweetAccessAuthentication,
  async (request, response) => {
    const {tweetId} = request.params

    const getLikedTweet = `
  SELECT username 
  FROM like NATURAL JOIN 
  user
  WHERE tweet_id = ${tweetId}`

    const likedTweet = await db.all(getLikedTweet)
    //console.log(likedTweet)
    const userNameArray = likedTweet.map(eachUser => {
      return eachUser.username
    })
    // console.log(userNameArray)

    response.send({likes: userNameArray})
  },
)

// API 8 GET METHOD;
app.get(
  '/tweets/:tweetId/replies/',
  authenticateToken,
  tweetAccessAuthentication,
  async (request, response) => {
    const {tweetId} = request.params

    const getreplyTweet = `
  SELECT name,reply 
  FROM reply NATURAL JOIN 
  user
  WHERE tweet_id = ${tweetId}`

    const replyTweet = await db.all(getreplyTweet)
    // console.log(replyTweet)

    // const nameArray = replyTweet.map(eachUser => {
    //   return eachUser.name
    // })
    // console.log(nameArray)

    response.send({replies: replyTweet})
  },
)

// API 9 GET METHOD;
app.get('/user/tweets/', authenticateToken, async (request, response) => {
  const {userId} = request
  const getTweetsList = `
    SELECT 
    t.tweet,
    COUNT(DISTINCT like.like_id) AS likes,
    COUNT(DISTINCT t.reply_id) AS replies,
    t.date_time AS dateTime
    FROM
    (tweet LEFT JOIN reply 
    ON tweet.tweet_id = reply.tweet_id) AS t
    LEFT JOIN like ON t.tweet_id = like.tweet_id
    WHERE tweet.user_id = ${userId}
    
    GROUP BY tweet.tweet_id`

  const tweetsList = await db.all(getTweetsList)
  response.send(tweetsList)
})

// API 10 POST METHOD:
app.post('/user/tweets/', authenticateToken, async (request, response) => {
  const {tweet} = request.body
  const {userId} = request
  const dateTime = new Date().toJSON().substring(0, 19).replace('T', ' ')

  // console.log(userId)
  // console.log(dateTime)

  const createTweetQuery = `
  INSERT INTO tweet(tweet,user_id,date_time)
  VALUES (
    '${tweet}',
    ${userId},
    '${dateTime}');`

  const createTweet = await db.run(createTweetQuery)
  response.send('Created a Tweet')
})

// API 11 DELETE METHOD;
app.delete(
  '/tweets/:tweetId/',
  authenticateToken,
  async (request, response) => {
    const {userId} = request
    const {tweetId} = request.params

    const getUserTweet = `
  SELECT * FROM 
  tweet
  WHERE tweet_id = ${tweetId} AND user_id = ${userId}`

    const userTweet = await db.get(getUserTweet)
    // console.log(userTweet)
    if (userTweet === undefined) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      const getDeleteTweet = `
    DELETE FROM tweet
    WHERE tweet_id = ${tweetId}`

      const deleteTweet = await db.run(getDeleteTweet)
      response.send('Tweet Removed')
    }
  },
)

module.exports = app
