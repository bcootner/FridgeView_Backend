var Clarifai = require('clarifai');

var app = new Clarifai.App(
    'hHUyyW6_ahQ4Lc3yNoSrcVqKX_d2B1izffyWVo49',
    'fCkpzb6ddxnr1Q7h6KwHhTNWp7IYUkff_Kf5g__B'
    );

/**
** @brief: search for a food item in FoodItem database
** If item does not exist, create one
**/
Parse.Cloud.define("searchInFoodItem", function(req, res) {
  var query = new Parse.Query("FoodItem");

  var ids_detected = [];
  var idsWithNames = {}; // mapping between id->name of food
  var idsWithProbabilities = {}; // mapping between id->probability of correctness (used for userFood class)

  for(var i =0; i<req.params.APIresponse.length; i++) {
    ids_detected.push(req.params.APIresponse[i]["id"]);
    idsWithNames[req.params.APIresponse[i]["id"]] = req.params.APIresponse[i]["name"];
    idsWithProbabilities[req.params.APIresponse[i]["id"]] = req.params.APIresponse[i]["value"];
  }

  console.log("IDs found by API: " + ids_detected.length);

  /*** (1): Searching for all ids that the Food API detected inside our FoodItem collection ***/
  query.containedIn("clarifaiID", ids_detected);
  query.find({
    success: function(foodItemsFound){ // foodItemsFound: contains IDs of all of the IDs that were detected and are inside the database

      /*** (2): Removing all IDs that have been detected inside database from our ids_detected array ***/
      for(var i=0; i<foodItemsFound.length; i++) {
        var elemToRemove = foodItemsFound[i].get("clarifaiID");
        var indexToRemove = ids_detected.indexOf(elemToRemove);

        if(indexToRemove > -1)
          ids_detected.splice(indexToRemove,1);
      }

      /* At this point, all elements inside ids_detected should be elements that needs to be added to the FoodItems collection */
      console.log("Number of IDs not in DB: " + ids_detected.length);
      /*** (3): Adding all new IDs to the database ***/
      var objectsToSave = [];
      var foodItemSubclass = Parse.Object.extend("FoodItem");
      
      for(var i=0; i<ids_detected.length; i++) {
        var foodItem = new foodItemSubclass();
        foodItem.set("clarifaiID", ids_detected[i]);
        foodItem.set("foodName", idsWithNames[ids_detected[i]]);
        objectsToSave.push(foodItem);
      }

      /*** (4): Submitting query to save ***/
      Parse.Object.saveAll(objectsToSave, {
        useMasterKey: true,
        success: function(succ) {
          console.log("Successfully saved " + objectsToSave.length + " IDs");
          res.success("done");
        },
        error: function(error) {
          console.log("error while saving to DB");
          console.log(error);
          res.error(error);
        }
      });

    },
    error: function(error){
      console.log(error);
      res.error(error);
    }


  });

});

//MARK: beforeSave Functions 
Parse.Cloud.beforeSave("SensorData", function(req, res) {
  var sensorDataObject = req.object;
  var sensorDataQuery = new Parse.Query("SensorData")
  var userPointer = {__type: 'Pointer', className: '_User', objectId: sensorDataObject.get("user").id}
  sensorDataQuery.equalTo("user", userPointer)
  sensorDataQuery.equalTo("sensorCubeID", sensorDataObject.get("sensorCubeID"))
  sensorDataQuery.notEqualTo("objectId", sensorDataObject..get("objectId"))
  sensorDataQuery.find({
    success: function(previousSensorDatas) {
        console.log("found prev data:" + previousSensorDatas.length)
        Parse.Object.destroyAll(previousSensorDatas);
      },
      error: function(error) {
        console.log("error finding sensor data");
      }
  })

  res.success();
})

Parse.Cloud.beforeSave("Photos", function(req, res) {

	var photoObject = req.object;

  //if(!photoObject.existed()) {

    var imageString = photoObject.get("encrypStr");
    imageString.replace(/\r?\n|\r/g, "");

    console.log("Predicting...");
    app.models.predict(Clarifai.FOOD_MODEL, {base64: imageString}).then(
        function(response) {
            console.log("Found something!");
            //console.log(response.outputs[0]["data"].concepts); // printing all of the detected ingredients from image
            Parse.Cloud.run('searchInFoodItem', {"APIresponse": response.outputs[0]["data"].concepts}, {
              useMasterKey: true,
              success: function(res) {
                console.log("successfully called function");
              },
              error: function(err) {
                console.log("err: Parse.Cloud.run");
              }
            });

        },
        function(err) {
          // there was an error
          console.log("Error :(");
          console.log(err);
        }
      );
  //}

	res.success(); // save image in DB
});