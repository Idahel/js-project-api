import cors from "cors"
import express, { response } from "express"
import listEndpoints from 'express-list-endpoints'
import mongoose from "mongoose"


import thoughtData from "./data.json"

const mongoUrl = process.env.MONGO_URL || "mongodb://localhost/happyThoughts"
mongoose.connect(mongoUrl)

// Defines the port the app will run on. Defaults to 8080, but can be overridden
// when starting the server. Example command to overwrite PORT env variable value:
// PORT=9000 npm start
const port = process.env.PORT || 9000
const app = express()

// Add middlewares to enable cors and json body parsing
app.use(cors())
app.use(express.json())

const thoughtSchema = new mongoose.Schema({
  id: Number,
  message: {
    type: String,
    required: true,
    minlength: 5,
    maxlength: 140,
    trim: true
  },
  hearts: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: () => new Date()
  }
})

const Thought = mongoose.model("Thought", thoughtSchema)

if (process.env.RESET_DB){
  const seedDatabase = async () => {
    try {
      await Thought.deleteMany({})

      for (const thought of thoughtData) {

        const newThought = new Thought({
          message: thought.message,
          hearts: thought.hearts || 0,
          createdAt: thought.createdAt ? new Date(thought.createdAt) : new Date()
        })
        await newThought.save()
      }
    } catch (error) {
      console.error("Error seeding database:", error)
    }
  }
  seedDatabase()
}

// Root endpoint that provides API information

app.get("/", (req, res) => {

  const endpoints = listEndpoints(app)

  res.status(200).json ({
    success: true,
    response: {
      message: "Welcome to the Happy Thoughts API",
      endpoints: endpoints
    },
    message: "API information retrieved successfully."
  })
})

//Get all thoughts with filtering, sorting and pagination

app.get("/thoughts", async (req, res) => {

  const { hearts, message, page, limit, sort } = req.query

  const query = {}

  let filteredThoughts = [...thoughtData]

//Filter to get the messages with at least the amount of hearts that the user asks for
if (hearts) {
  const minHearts = parseInt(hearts, 10)
  if(!isNaN(minHearts)) {
    query.hearts = { $gte: minHearts } //$gte = MongoDB query operator "greater than or equal to"
  } else {
    return res.status(400).json({
      success: false,
      response: null,
      message: "Invalid 'hearts' parameter. Must be a number."
    })
  }
}

//Filtering by message or part of message content eg if the user search for "happy"
  if (message) {
    query.message = { $regex: new RegExp(message, 'i') }
  }

//Sort the messages for date created and amount of hearts
const sortOptions = {}
if (sort) {
  if (sort === 'createdAt') {
    sortOptions.createdAt = -1; // Newest first
  } else if (sort === 'hearts') {
    sortOptions.hearts = -1; // Most hearts first
  } else {
    return res.status(400).json({
      success: false,
      response: null,
      message: "Invalid 'sort' parameter. Valid options are 'createdAt' or 'hearts'."
    })
  }
}

//Let the user choose to view a specific amount of thoughts per page and also to go between pages
  const pageNum = parseInt(page, 10) || 1 //Default to page 1
  const limitNum = parseInt(limit, 10) || 10 //Default limit of 10 thoughts per page
  const startIndex = (pageNum - 1) * limitNum

  try {
    const totalResults = await Thought.countDocuments(query)
    const thoughts = await Thought.find(query)
      .sort(sortOptions)
      .skip(startIndex)
      .limit(limitNum)

    res.status(200).json({
      success: true,
      response: {
        totalResults: totalResults,
        currentPage: pageNum,
        resultsPerPage: thoughts.length,
        thoughts: thoughts
      },
      message: "Thoughts retrieved successfully."
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      response: error,
      message: "Failed to retrieve thoughts."
    })
  }
})

//endpoint for getting one specific thought - based on id
app.get("/thoughts/:id/", async (req, res) => {

  const { id } = req.params

  try {
    const thought = await Thought.findById(id)

    if (!thought) {
      return res.status(404).json({
        success: false,
        response: null,
        message: `Thought with id '${id}' not found.`
      })
    }

    res.status(200).json({
      success: true,
      response: thought,
      message: `Thought with id '${id}' retrieved successfully.`
    })

  } catch (error) {
    res.status(400).json({
      success: false,
      response: error,
      message: "Invalid thought ID format."
    })
  }
})

//Post endpoint

app.post("/thoughts", async (req, res) => {

  const {message} = req.body

  try {
    const newThought = await new Thought ({message}).save()

    res.status(201).json({
      success: true,
      response: newThought,
      message: "Thought created successfully"
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      response: error,
      message: "Failed to create thought."
    })
  }
})

//Delete endpoint: delete a thought by ID

app.delete("/thoughts/:id", async (req, res) => {

  const { id } = req.params

  try {
    const deletedThought = await Thought.findByIdAndDelete(id)

    if(!deletedThought) {
      return res.status(404).json({
        success: false,
        response: null,
        message: "Thought could not be found, can't delete."
      })
    }
    res.status(200).json({
      success: true,
      response: deletedThought,
      message: "Thought was successfully deleted."
    })
  } catch {
    res.status(500).json({
      success: false,
      response: error,
      message: "Failed to delete thought."
    })
  }
})

// Patch endpoint: update a thought by ID

app.patch("/thoughts/:id", async (req, res) => {

  const { id } = req.params
  const { newMessage } = req.body

  try {
    const updatedThought = await Thought.findByIdAndUpdate ( id, { message: newMessage }, {new: true, runValidators: true})

    if(!updatedThought) {
      return res.status(404).json({
        success: false,
        response: null,
        message: "Thought could not be found."
      })
    }

    res.status(200).json({
      success: true,
      response: updatedThought,
      message: "Thought was successfully updated"
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      response: error,
      message: "Could not edit thought."
    })
  }
})

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`)
})