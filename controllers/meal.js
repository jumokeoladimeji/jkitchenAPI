const Meal = require('../models').Meal;
const redis = require('redis');

let client;
if (process.env.REDIS_URL) {
  client = redis.createClient(process.env.REDIS_URL, { no_ready_check: true });
} else {
  client = redis.createClient();
}
const Rating = require('../models').Rating;
const Comment = require('../models').Comment;
const MealOrderDetail = require('../models').MealOrderDetail

module.exports = { 
    /**
  * @description - Creates a new meal
  * @param {object} request - request object containing the meal title, price,available_quantity,image,
  * description received from the client
  * @param {object} response - response object served to the client
  * @returns {json} meal - new meal created
  */
  // Only admin can create and update meal
  create (req, res) {
    console.log(req.body)
    Meal
      .create({
        title: req.body.title,
        price: req.body.price,
        available_quantity: req.body.available_quantity,
        image: req.body.image,
        description: req.body.description
      })
      .then((meal) => res.status(200).send(meal))
      .catch((error) => {
        res.status(500).send({message: error})
      });
  },

  /**
  * @description - Fetches all meals
  * @param {object} request - request object received from the client
  * @param {object} response - response object served to the client
  * @returns {json} meals - meals fetched
  */

  list (req, res) {
    Meal
      .findAll({
        include: [
          {
            model: Rating,
            as: 'ratings'
          }
        ]})
      .then((meals) => res.status(200).send(meals))
      .catch((error) => {
        res.status(500).send({message: error})
      });
  },
  /**
  * @description - Fetches a meal
  * @param {object} request - request object received from the client
  * @param {object} response - response object served to the client
  * @returns {json} meal - fetched meal
  */
  getOne (req, res) {
    const mealId = req.params.mealId
    // get meal from redis cache
    client.get(`meal${mealId}`, function (err, reply) {
      if (err) {
        return res.status(500).send({message:err})
      }
      if (reply) {
        let meal = JSON.parse(reply)
        // create a set in redis for popular meals
        // when count is more than one, add the meal to popular meals
        if (meal.count > 1) {
          client.sadd('mostPopularMeals', reply)
        } else {
          meal.count++
          client.set(`meal${mealId}`, JSON.stringify(meal), function(err, reply) {
            if (err) {
              return res.status(500).send({message:err})
            }
            return res.status(200).send(meal);
          });
        }
      } else {
        return Meal
          .findById(req.params.mealId, {
            include: [{
              model: Rating,
              as: 'ratings'
            }, {
              model: Comment,
              as: 'comments'
            }, {
              model: MealOrderDetail,
              as: 'mealOrderDetails'
            }]
          })
          .then(meal => {
            if (!meal) {
              return res.status(404).send({
                message: 'Meal Not Found'
              });
            }
            let mealToCache = meal.dataValues
            mealToCache.count = 0
            client.set(`meal${mealId}`, JSON.stringify(mealToCache), function (err, reply) {
              return res.status(200).send(meal);
            });
          })
          .catch((error) => {
            res.status(500).send({message: error})
          });
      }
    });
  },
  /**
  * @description - Fetches the popular meals
  * @param {object} request - request object received from the client
  * @param {object} response - response object served to the client
  * @returns {array} meals - Popular meals
  */
  getMostPopularMeals (req, res) {
    client.smembers('mostPopularMeals', function (err, reply){
      if (err) {
        return res.status(500).send({message: err})
      }
      // reply is an array of popular meals
      return res.status(200).send(reply);
    });
  },
   /**
  * @description - Updates meal details
  * @param {object} request - request object received from the client
  * @param {object} response - response object served to the client
  * @returns {json} meal - updated meal details
  */
  update (req, res) {
    const mealId = req.params.mealId
    Meal
      .findById(req.params.mealId, {
        include: [{
          model: Rating,
          as: 'ratings'
        }, {
          model: Comment,
          as: 'comments'
        }, {
          model: MealOrderDetail,
          as: 'mealOrderDetails'
        }]
      })
      .then(meal => {
        if (!meal) {
          return res.status(404).send({
            message: 'Meal Not Found'
          });
        } else {
          return meal
            .update({
              title: req.body.title || meal.title,
              price: req.body.price || meal.price,
              available_quantity: req.body.available_quantity || meal.available_quantity,
              image: req.body.image || meal.image,
              description: req.body.description || meal.description,
            })
            .then((updatedMeal) => {
              const mealToUpdate = JSON.stringify(meal)
              // delete meal from the mostPopularMeals set
              client.srem('mostPopularMeals', mealToUpdate)
              // add updated meal to the set
              client.sadd('mostPopularMeals', JSON.stringify(updatedMeal))
              // client.smembers('mostPopularMeals')
              // update meal in redis string
              client.set(`meal${mealId}`, JSON.stringify(updatedMeal), function(err, updatedMealInCache) {
                return res.status(200).send(updatedMeal);
              });
            })
        }
      })
      .catch((error) => {
        res.status(500).send({message: error})
      });
  },
  /**
  * @description - Deletes a meal
  * @param {object} request - request object received from the client
  * @param {object} response - response object served to the client
  * @returns {json} - Meal created
  */
  destroy (req, res) {
    const mealId = req.params.mealId
    Meal
      .findById(req.params.mealId)
      .then(meal => {
        if (!meal) {
          return res.status(500).send({
            message: 'Meal Not Found'
          });
        }
        return meal
          .destroy()
          .then(() => {
            const mealToDelete = JSON.stringify(meal)
            client.srem('mostPopularMeals', mealToDelete)
            client.del(`meal${mealId}`)
            res.status(200).send({message: 'Meal deleted.'})
          })
      })
      .catch((error) => res.status(500).send({message: error}));
  }
};