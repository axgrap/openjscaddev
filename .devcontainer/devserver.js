const budo = require('budo')
const path = require('path')
const copydir = require('copy-dir')
const fs = require('fs')
const DocBlock = require('docblock')
const docBlock = new DocBlock()
console.log('Current working directory:', process.cwd())
console.log('Node version:', process.version)
console.log('Platform:', process.platform)
console.log('Environment:', process.env.NODE_ENV || 'development')

const examplesSrc = path.resolve('/workspace/openjscad/packages/web/examples')
const ignoreExamples = { Imports: 1, Projects: 1 }

// Start budo server
const server = budo('/workspace/openjscad/packages/web/demo.js', {
  live: true,
  port: 8081,
  css: './css/demo.css'
})

// Handle server events
server.on('connect', function(ev) {
  console.log('Server started on port:', ev.port)
  processExamples()
})

server.on('reload', function() {
  console.log('Server reloaded')
  processExamples()
})

function processExamples() {
  try {
    copyAndProcessExamples(examplesSrc)
  } catch (error) {
    console.error('Error processing examples:', error)
  }
}

function copyAndProcessExamples(examplesSrc) {
  const examples = { 'Creating Shapes': [], 'Manipulating Shapes': [], Colors: [], Parameters: [], Other: [] }
  const examplesDist = 'examples'
  if (fs.existsSync(examplesSrc)) {
    console.log('Copying Examples...', examplesSrc)
    copydir.sync(examplesSrc, examplesDist, { mode: false })
    processExamplesInDirectory(examplesDist, examples)
    sortExamples(examples)
    fs.writeFile('examples/examples.json', JSON.stringify(examples), (err) => {
      if (err) return console.log(err)
    })
  } else {
    return console.log('Examples directory does not exist: ' + examplesSrc)
  }
}

function processExamplesInDirectory(dir, examples) {
  const files = fs.readdirSync(dir)
  files.forEach((fileName) => {
    const filePath = path.join(dir, fileName)
    if (fs.lstatSync(filePath).isDirectory()) {
      processExamplesInDirectory(filePath, examples)
    } else if (filePath.endsWith('.js')) {
      processExamplesFile(filePath, examples)
    }
  })
}

function processExamplesFile(filePath, examples) {
  const result = docBlock.parse(fs.readFileSync(filePath), 'js')
  if (result.length) {
    const category = result[0].tags.category

    if (category in ignoreExamples) {
      console.log(`Ignoring example ${filePath}`)
      return
    }

    const title = result[0].title
    const description = result[0].description
    const sort = parseInt(result[0].tags.skillLevel)
    if (!(category in examples)) {
      const categories = Object.keys(examples)
      console.error(`ERR: Example ${filePath} did not have a valid category set. Valid categories are ${categories}`)
      return
    }
    examples[category].push({ title, filePath, sort, description })
  }
}

function sortExamples(examples) {
  for (const category in examples) {
    if (!Object.prototype.hasOwnProperty.call(examples, category)) continue
    examples[category] = examples[category].sort((a, b) => {
      if (a.sort === b.sort) {
        return a.title > b.title ? 1 : -1
      }
      return a.sort - b.sort
    })
  }
}
