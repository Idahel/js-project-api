import cors from "cors"
import express from "express"
import listEndpoints from 'express-list-endpoints'
import mongoose from "mongoose"


import thoughtData from "./data.json"

const mongoUrl = process.env.MONGO_URL || "mongodb://localhost/happy-thoughts"
mongoose.connect(mongoUrl)

// Defines the port the app will run on. Defaults to 8080, but can be overridden
// when starting the server. Example command to overwrite PORT env variable value:
// PORT=9000 npm start
const port = process.env.PORT || 8080
const app = express()

// Add middlewares to enable cors and json body parsing
app.use(cors())
app.use(express.json())

const thoughtSchema = new mongoose.Schema({

})

const Thought = mongoose.model("thought", thoughtSchema)

if (process.env.RESET_DB){
  const seedDatabase = async () => {
    await Thought.deleteMany({})
    thoughtData.forEach(thought => {
      new Thought(thought).save()   
  })
}
seedDatabase()
}

// Start defining your routes here
app.get("/", (req, res) => {
  const endpoints = listEndpoints(app)

  res.json ({
    message: "Welcome to the Happy Thoughts API",
    endpoints: endpoints
  })
})

app.get("/thoughts", async (req, res) => {

  const { hearts, message, page, limit, sort } = req.query

  const query = {}

  let filteredThoughts = [...thoughtData]

//Filter to get the messages with at least the amount of hearts that the user asks for
  if (hearts) {
    const minHearts = parseInt(hearts, 10)
    if(!isNaN(minHearts)) {
    filteredThoughts = filteredThoughts.filter(thought => thought.hearts >= minHearts)
  } else {
    return res.status(400).json({error:"Invalid hearts parameter. Must be a number"})
  }
}

//Filtering by message or part of message content eg if the user search for "happy"
   if (message) {
    const searchMessage = message.toLowerCase();
    filteredThoughts = filteredThoughts.filter(thought =>
      thought.message.toLowerCase().includes(searchMessage)
    )
  }

//Sort the messages for date created and amount of hearts
  if (sort) {
    if (sort === 'createdAt') {
      filteredThoughts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // Newest first
    } else if (sort === 'hearts') {
      filteredThoughts.sort((a, b) => b.hearts - a.hearts); // Most hearts first
    } else {
      return res.status(400).json({ error: "Invalid 'sort' parameter. Valid options are 'createdAt' or 'hearts'." })
    }
  }

//Let the user choose to view a specific amount of thoughts per page and also to go between pages
  const pageNum = parseInt(page, 10) || 1 //Default to page 1
  const limitNum = parseInt(limit, 10) || 10 //Default limit of 10 thoughts per page
  const startIndex = (pageNum - 1) * limitNum
  const endIndex = pageNum * limitNum

  const paginatedThoughts = filteredThoughts.slice(startIndex, endIndex)

  res.json({
    totalResults: filteredThoughts.length,
    currentPage: pageNum,
    resultsPerPage: paginatedThoughts.length,
    thoughts: paginatedThoughts
  })
})

//endpoint for getting one specific thought - based on id
app.get("/thoughts/:id/", (req, res) => {
  const thought = thoughtData.find((thought) => thought._id === req.params.id)

  if (!thought) {
    return res.status(404).json({error: 'thought not found'})
  }

  res.json(thought)
})

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`)
})