import cors from "cors"
import express from "express"
import listEndpoints from 'express-list-endpoints'
import mongoose from "mongoose"
import crypto from "crypto"
import bcrypt from "bcrypt"

import thoughtData from "./data.json"

const mongoUrl = process.env.MONGO_URL || "mongodb://localhost/happyThoughts"
mongoose.connect(mongoUrl)
mongoose.Promise = Promise

// Defines the port the app will run on. Defaults to 8080, but can be overridden
// when starting the server. Example command to overwrite PORT env variable value:
// PORT=9000 npm start
const port = process.env.PORT || 8080
const app = express()

// Add middlewares to enable cors and json body parsing
app.use(cors())
app.use(express.json())


// Authentication
const { Schema, model } = mongoose

const userSchema = new Schema({
  name: {
    type: String,
    unique: true,
    required: true
  },
  email: { 
    type: String,
    unique: true,
    required: true
  },
  password: {
    type: String,
    required: true
  },
  accessToken: {
    type: String,
    default: () => crypto.randomBytes(128).toString("hex")
  }
})

const User = model("User", userSchema)

// Middleware for authenticating users via accessToken
const authenticateUser = async (req, res, next) => {
  const accessToken = req.header("Authorization")?.replace("Bearer ", "")
  if (!accessToken) {
    return res.status(401).json({
      success: false,
      response: null,
      message: "Unauthorized: No access token provided."
    })
  }

  try {
    const user = await User.findOne({ accessToken: accessToken })

    if (user) {
      req.user = user
      next()
    } else {
      res.status(401).json({
        success: false,
        response: null,
        message: "Unauthorized: Access token invalid or missing."
      })
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      response: error,
      message: "Server error during authentication."
    })
  }
}

app.post("/users", async (req, res) => {
  try {
    const { name, email, password } = req.body
    const salt = bcrypt.genSaltSync()
    const user = new User({ name, email, password: bcrypt.hashSync(password, salt) })
    await user.save() 

    res.status(201).json({
      success: true,
      message: "User created successfully",
      response: {
        id: user._id,
        accessToken: user.accessToken,
        name: user.name,
        email: user.email
      }
    })
  } catch (error) {
    if (error.code === 11000) {
      res.status(409).json({
        success: false,
        response: error,
        message: "User with this name or email already exists."
      })
    } else if (error.name === 'ValidationError') {
      res.status(400).json({
        success: false,
        response: error.errors,
        message: "Validation failed for user creation."
      })
    } else {
      res.status(500).json({
        success: false,
        response: error,
        message: "Failed to create user."
      })
    }
  }
})

app.get("/secrets", authenticateUser, (req, res) => {
  res.status(200).json({
    success: true,
    response: {
      secret: `This is a secret, accessible only to authenticated user: ${req.user.name}`
    },
    message: "Secret retrieved successfully."
  })
})

app.post("/sessions", async (req, res) => {
  const { email, password } = req.body
  try {
    const user = await User.findOne({ email: email })

    if (user && bcrypt.compareSync(password, user.password)) {
      res.status(200).json({
        success: true,
        response: {
          id: user._id,
          accessToken: user.accessToken,
          name: user.name
        },
        message: "Login successful."
      })
    } else {
      res.status(401).json({
        success: false,
        response: null,
        message: "Login failed: Invalid email or password."
      })
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      response: error,
      message: "Server error during login."
    })
  }
})

//Thoughts
const thoughtSchema = new mongoose.Schema({
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
  },
  userId: {
    type: String,
    required: true
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
          createdAt: thought.createdAt ? new Date(thought.createdAt) : new Date(),
          userId: thought.userId || 'seed-user-id'
        })
        await newThought.save()
      }
    } catch (error) {
      console.error(error)
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

  const { hearts, message, page, limit, sort, id } = req.query

  const query = {}

  if (id) {
    query._id = id
  }

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
    if (sort === 'createdAt_desc' || sort === 'createdAt') {
      sortOptions.createdAt = -1
    } else if (sort === 'createdAt_asc') {
      sortOptions.createdAt = 1
    } else if (sort === 'hearts') {
      sortOptions.hearts = -1
    } else {
      return res.status(400).json({
        success: false,
        response: null,
        message: "Invalid 'sort' parameter. Valid options are 'createdAt_desc', 'createdAt_asc', or 'hearts'."
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
app.post("/thoughts", authenticateUser, async (req, res) => {

  const {message} = req.body
  const userId = req.user._id

  try {
    const newThought = await new Thought ({message, userId}).save()

    res.status(201).json({
      success: true,
      response: newThought,
      message: "Thought created successfully"
    })
  } catch (error) {
    if (error.name === 'ValidationError') {
      res.status(400).json({
        success: false,
        response: error.errors,
        message: "Validation failed for thought creation."
      })
    } else {
      res.status(500).json({
        success: false,
        response: error,
        message: "Failed to create thought."
      })
    }
  }
})

//Delete endpoint: delete a thought by ID
app.delete("/thoughts/:id", authenticateUser, async (req, res) => {

    const { id } = req.params
    const authenticatedUserId = req.user._id

    try {
      const thoughtToDelete = await Thought.findById(id)

      if (!thoughtToDelete) {
        return res.status(404).json({
          success: false,
          response: null,
          message:"Thought could not be found, can't delete."
        })
      }

    if (thoughtToDelete.userId.toString() !== authenticatedUserId.toString()) {
      return res.status(403).json({
        success: false,
        response: null,
        message: "You are not authorized to delete this thought."
      })
    }

    const deletedThought = await Thought.findByIdAndDelete(id)

    res.status(200).json({
      success: true,
      response: deletedThought,
      message: "Thought was successfully deleted."
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      response: error,
      message: "Failed to delete thought."
    })
  }
})

// Patch endpoint: update a thought by ID
app.patch("/thoughts/:id/like", async (req, res) => {
  const { id } = req.params

  try {
    const updatedThought = await Thought.findByIdAndUpdate(
      id,
      { $inc: { hearts: 1 } },
      { new: true }
    )

    if (!updatedThought) {
      return res.status(404).json({
        success: false,
        response: null,
        message: "Thought could not be found to like."
      })
    }

    res.status(200).json({
      success: true,
      response: updatedThought,
      message: "Thought successfully liked."
    })

  } catch (error) {
    res.status(400).json({
      success: false,
      response: error,
      message: "Failed to like thought due to invalid ID or server error."
    })
  }
})

// Patch endpoint: update a thought by ID (for message and unlike, now authenticated and authorized)
app.patch("/thoughts/:id", authenticateUser, async (req, res) => {
  const { id } = req.params
  const { message, unlike } = req.body
  const authenticatedUserId = req.user._id

  try {
    const thought = await Thought.findById(id)

    if (!thought) {
      return res.status(404).json({
        success: false,
        response: null,
        message: "Thought could not be found."
      })
    }

    const updateFields = {}
    let performUpdate = false

    if (message !== undefined) {
      if (thought.userId.toString() !== authenticatedUserId.toString()) {
        return res.status(403).json({
          success: false,
          response: null,
          message: "You are not authorized to edit this thought's message."
        })
      }
      updateFields.message = message
      performUpdate = true
    }

    let newHearts = thought.hearts
    if (unlike) {
      newHearts = Math.max(0, thought.hearts - 1)
      if (newHearts !== thought.hearts) {
        updateFields.hearts = newHearts
        performUpdate = true
      }
    }

    if (!performUpdate) {
      return res.status(200).json({
        success: true,
        response: thought,
        message: "No valid update fields provided, thought not modified."
      })
    }

    const updatedThought = await Thought.findByIdAndUpdate(
      id,
      updateFields,
      { new: true, runValidators: true }
    )

    if(!updatedThought) {
      return res.status(404).json({
        success: false,
        response: null,
        message: "Thought could not be found after update attempt."
      })
    }

    res.status(200).json({
      success: true,
      response: updatedThought,
      message: "Thought was successfully updated."
    })
  } catch (error) {
    if (error.name === 'ValidationError') {
      res.status(400).json({
        success: false,
        response: error.errors,
        message: "Validation failed for thought update."
      })
    } else {
      res.status(500).json({
        success: false,
        response: error,
        message: "Could not edit thought."
      })
    }
  }
})

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`)
})