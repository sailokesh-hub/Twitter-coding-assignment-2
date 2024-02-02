const express = require("express");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const app = express();
const dbPath = path.join(__dirname, "twitterClone.db");
app.use(express.json());
let database = null;
const initializeDbAndServer = async () => {
  try {
    database = await open({ filename: dbPath, driver: sqlite3.Database });
    app.listen(3000, () => {
      console.log("Server Is running on http://localhost:3000");
    });
  } catch (error) {
    console.log(`Data base Error is ${error}`);
    process.exit(1);
  }
};

initializeDbAndServer();

//checking USER present or not
const checkUserPresent = async (request, response, next) => {
  const { username } = request.body;
  const getUserQuery = `select * from user where username='${username}';`;
  const dbResponse = await database.get(getUserQuery);
  if (dbResponse !== undefined) {
    response.status(400);
    response.send("User already exists");
    return;
  }
  next();
};

//checking for USERNAME in database
const checkUserName = async (request, response, next) => {
  const { username } = request.body;
  const userPresent = `select username from user where username='${username}';`;
  const dbResponse = await database.get(userPresent);

  if (!dbResponse || !dbResponse.username) {
    response.status(400);
    response.send("Invalid user");
    return;
  }

  const { username: user } = dbResponse;
  if (user === username) {
    request.username = username;
    next();
  } else {
    response.status(400);
    response.send("Invalid user");
    return;
  }
};

//checking password match
const checkPassword = async (request, response, next) => {
  const { username } = request;
  const { password } = request.body;
  const getPasswordQuery = `select password from user where username='${username}';`;
  const dbResponse = await database.get(getPasswordQuery);
  const isPasswordValid = await bcrypt.compare(password, dbResponse.password);
  if (isPasswordValid === true) {
    request.password = password;
    next();
  } else {
    response.status(400);
    response.send("Invalid password");
    return;
  }
};

//verifying jsonwebToken
const verifyToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (authHeader === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
    return;
  } else {
    jwt.verify(jwtToken, "SECRET_KEY", async (error, payload) => {
      if (error) {
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//API 1
app.post("/register/", checkUserPresent, async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const createQuery = `insert into user(username, password, name, gender) values('${username}', '${hashedPassword}', '${name}', '${gender}');`;
  if (password.length < 6) {
    response.status(400);
    response.send("Password is too short");
  } else {
    await database.run(createQuery);
    response.send("User created successfully");
  }
});

app.get("/get", async (request, response) => {
  response.send("you are hacked");
});

//API 2
// sending login request with valid credentials
app.post("/login/", checkUserName, checkPassword, async (request, response) => {
  const { username, password } = request;
  console.log(username, password);
  const payload = { username: username };
  const jwtToken = await jwt.sign(payload, "SECRET_KEY");
  response.send({ jwtToken });
});

//API 3
app.get("/user/tweets/feed/", verifyToken, async (request, response) => {
  const { username } = request;
  const getUserIdQuery = `select user_id from user where username='${username}';`;
  const getUserId = await database.get(getUserIdQuery);
  const getFollowerIdsQuery = `select following_user_id from follower 
    where follower_user_id=${getUserId.user_id};`;
  const getFollowerIds = await database.all(getFollowerIdsQuery);
  const getFollowerIdsSimple = getFollowerIds.map((eachUser) => {
    return eachUser.following_user_id;
  });
  console.log(getFollowerIdsSimple);
  const getTweetQuery = `select user.username, tweet.tweet, tweet.date_time as dateTime 
      from user inner join tweet 
      on user.user_id= tweet.user_id where user.user_id in (${getFollowerIdsSimple})
       order by tweet.date_time desc limit 4;`;
  const responseResult = await database.all(getTweetQuery);
  response.send(responseResult);
});

//api4

app.get("/user/following/", verifyToken, async (request, response) => {
  let { username } = request;
  const getUserIdQuery = `select user_id from user where username='${username}';`;
  const getUserId = await database.get(getUserIdQuery);
  // console.log(getUserId);
  const getFollowerIdsQuery = `select following_user_id from follower 
    where follower_user_id=${getUserId.user_id};`;
  const getFollowerIdsArray = await database.all(getFollowerIdsQuery);
  //console.log(getFollowerIdsArray);
  const getFollowerIds = getFollowerIdsArray.map((eachUser) => {
    return eachUser.following_user_id;
  });
  //console.log(`${getFollowerIds}`);
  const getFollowersResultQuery = `select name from user where user_id in (${getFollowerIds});`;
  const responseResult = await database.all(getFollowersResultQuery);
  //console.log(responseResult);
  response.send(responseResult);
});

//api5

app.get("/user/followers/", verifyToken, async (request, response) => {
  let { username } = request;
  const getUserIdQuery = `select user_id from user where username='${username}';`;
  const getUserId = await database.get(getUserIdQuery);
  //console.log(getUserId);
  const getFollowerIdsQuery = `select follower_user_id from follower where following_user_id=${getUserId.user_id};`;
  const getFollowerIdsArray = await database.all(getFollowerIdsQuery);
  console.log(getFollowerIdsArray);
  const getFollowerIds = getFollowerIdsArray.map((eachUser) => {
    return eachUser.follower_user_id;
  });
  console.log(`${getFollowerIds}`);
  //get tweet id of user following x made
  const getFollowersNameQuery = `select name from user where user_id in (${getFollowerIds});`;
  const getFollowersName = await database.all(getFollowersNameQuery);
  //console.log(getFollowersName);
  response.send(getFollowersName);
});

//api 6
const api6Output = (tweetData, likesCount, replyCount) => {
  return {
    tweet: tweetData.tweet,
    likes: likesCount.likes,
    replies: replyCount.replies,
    dateTime: tweetData.date_time,
  };
};

app.get("/tweets/:tweetId/", verifyToken, async (request, response) => {
  const { tweetId } = request.params;
  //console.log(tweetId);
  let { username } = request;
  const getUserIdQuery = `select user_id from user where username='${username}';`;
  const getUserId = await database.get(getUserIdQuery);
  // console.log(getUserId);
  //get the ids of whom the use is following
  const getFollowingIdsQuery = `select following_user_id from follower where follower_user_id=${getUserId.user_id};`;
  const getFollowingIdsArray = await database.all(getFollowingIdsQuery);
  //console.log(getFollowingIdsArray);
  const getFollowingIds = getFollowingIdsArray.map((eachFollower) => {
    return eachFollower.following_user_id;
  });
  //console.log(getFollowingIds);
  //get the tweets made by the users he is following
  const getTweetIdsQuery = `select tweet_id from tweet where user_id in (${getFollowingIds});`;
  const getTweetIdsArray = await database.all(getTweetIdsQuery);
  const followingTweetIds = getTweetIdsArray.map((eachId) => {
    return eachId.tweet_id;
  });
  // console.log(followingTweetIds);
  //console.log(followingTweetIds.includes(parseInt(tweetId)));
  if (followingTweetIds.includes(parseInt(tweetId))) {
    const likes_count_query = `select count(user_id) as likes from like where tweet_id=${tweetId};`;
    const likes_count = await database.get(likes_count_query);
    //console.log(likes_count);
    const reply_count_query = `select count(user_id) as replies from reply where tweet_id=${tweetId};`;
    const reply_count = await database.get(reply_count_query);
    // console.log(reply_count);
    const tweet_tweetDateQuery = `select tweet, date_time from tweet where tweet_id=${tweetId};`;
    const tweet_tweetDate = await database.get(tweet_tweetDateQuery);
    //console.log(tweet_tweetDate);
    response.send(api6Output(tweet_tweetDate, likes_count, reply_count));
  } else {
    response.status(401);
    response.send("Invalid Request");
    console.log("Invalid Request");
  }
});

//api 7
const convertLikedUserNameDBObjectToResponseObject = (dbObject) => {
  return {
    likes: dbObject,
  };
};
app.get("/tweets/:tweetId/likes/", verifyToken, async (request, response) => {
  const { tweetId } = request.params;
  let { username } = request;
  const getUserIdQuery = `select user_id from user where username='${username}';`;
  const getUserId = await database.get(getUserIdQuery);
  const getFollowingIdsQuery = `select following_user_id from follower where follower_user_id=${getUserId.user_id};`;
  const getFollowingIdsArray = await database.all(getFollowingIdsQuery);
  const getFollowingIds = getFollowingIdsArray.map((eachFollower) => {
    return eachFollower.following_user_id;
  });
  const getTweetIdsQuery = `select tweet_id from tweet where user_id in (${getFollowingIds});`;
  const getTweetIdsArray = await database.all(getTweetIdsQuery);
  const getTweetIds = getTweetIdsArray.map((eachTweet) => {
    return eachTweet.tweet_id;
  });
  if (getTweetIds.includes(parseInt(tweetId))) {
    const getLikedUsersNameQuery = `select user.username as likes from user inner join like
       on user.user_id=like.user_id where like.tweet_id=${tweetId};`;
    const getLikedUserNamesArray = await database.all(getLikedUsersNameQuery);
    const getLikedUserNames = getLikedUserNamesArray.map((eachUser) => {
      return eachUser.likes;
    });
    response.send(
      convertLikedUserNameDBObjectToResponseObject(getLikedUserNames)
    );
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//api 8
const convertUserNameReplyedDBObjectToResponseObject = (dbObject) => {
  return {
    replies: dbObject,
  };
};
app.get("/tweets/:tweetId/replies/", verifyToken, async (request, response) => {
  //tweet id of which we need to get reply's
  const { tweetId } = request.params;
  console.log(tweetId);
  //user id from user name
  let { username } = request;
  const getUserIdQuery = `select user_id from user where username='${username}';`;
  const getUserId = await database.get(getUserIdQuery);
  // console.log(getUserId);
  //get the ids of whom the user is following
  const getFollowingIdsQuery = `select following_user_id from follower where follower_user_id=${getUserId.user_id};`;
  const getFollowingIdsArray = await database.all(getFollowingIdsQuery);
  //console.log(getFollowingIdsArray);
  const getFollowingIds = getFollowingIdsArray.map((eachFollower) => {
    return eachFollower.following_user_id;
  });
  console.log(getFollowingIds);
  //check if the tweet ( using tweet id) made by the person he is  following
  const getTweetIdsQuery = `select tweet_id from tweet where user_id in (${getFollowingIds});`;
  const getTweetIdsArray = await database.all(getTweetIdsQuery);
  const getTweetIds = getTweetIdsArray.map((eachTweet) => {
    return eachTweet.tweet_id;
  });
  console.log(getTweetIds);
  //console.log(getTweetIds.includes(parseInt(tweetId)));
  if (getTweetIds.includes(parseInt(tweetId))) {
    //get reply's
    //const getTweetQuery = `select tweet from tweet where tweet_id=${tweetId};`;
    //const getTweet = await database.get(getTweetQuery);
    //console.log(getTweet);
    const getUsernameReplyTweetsQuery = `select user.name, reply.reply from user inner join reply on user.user_id=reply.user_id
      where reply.tweet_id=${tweetId};`;
    const getUsernameReplyTweets = await database.all(
      getUsernameReplyTweetsQuery
    );
    //console.log(getUsernameReplyTweets);
    /* console.log(
        convertUserNameReplyedDBObjectToResponseObject(getUsernameReplyTweets)
      );*/

    response.send(
      convertUserNameReplyedDBObjectToResponseObject(getUsernameReplyTweets)
    );
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

//api9
app.get("/user/tweets/", verifyToken, async (request, response) => {
  let { username } = request;
  const getUserIdQuery = `select user_id from user where username='${username}';`;
  const getUserId = await database.get(getUserIdQuery);
  console.log(getUserId);
  //get tweets made by user
  const getTweetIdsQuery = `select tweet_id from tweet where user_id=${getUserId.user_id};`;
  const getTweetIdsArray = await database.all(getTweetIdsQuery);
  const getTweetIds = getTweetIdsArray.map((eachId) => {
    return parseInt(eachId.tweet_id);
  });
  console.log(getTweetIds);
});

//api 10

app.post("/user/tweets/", verifyToken, async (request, response) => {
  let { username } = request;
  const getUserIdQuery = `select user_id from user where username='${username}';`;
  const getUserId = await database.get(getUserIdQuery);
  const { tweet } = request.body;
  const currentDate = new Date();
  console.log(currentDate.toISOString().replace("T", " "));

  const postRequestQuery = `insert into tweet(tweet, user_id, date_time) values ("${tweet}", ${getUserId.user_id}, '${currentDate}');`;

  const responseResult = await database.run(postRequestQuery);
  const tweet_id = responseResult.lastID;
  response.send("Created a Tweet");
});

//api 11
app.delete("/tweets/:tweetId/", verifyToken, async (request, response) => {
  const { tweetId } = request.params;
  let { username } = request;
  const getUserIdQuery = `select user_id from user where username='${username}';`;
  const getUserId = await database.get(getUserIdQuery);
  const getUserTweetsListQuery = `select tweet_id from tweet where user_id=${getUserId.user_id};`;
  const getUserTweetsListArray = await database.all(getUserTweetsListQuery);
  const getUserTweetsList = getUserTweetsListArray.map((eachTweetId) => {
    return eachTweetId.tweet_id;
  });
  console.log(getUserTweetsList);
  if (getUserTweetsList.includes(parseInt(tweetId))) {
    const deleteTweetQuery = `delete from tweet where tweet_id=${tweetId};`;
    await database.run(deleteTweetQuery);
    response.send("Tweet Removed");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

module.exports = app;
