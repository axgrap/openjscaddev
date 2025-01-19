const budo = require('budo')
const path = require('path')
const copydir = require('copy-dir')
const fs = require('fs')

// Add timestamp function
const getTimestamp = () => `[${new Date().toISOString()}]`

console.log(`${getTimestamp()} 🚀 Starting devserver...`)
console.log(`${getTimestamp()} 📂 Current working directory:`, process.cwd())
console.log(`${getTimestamp()} 🔧 Node version:`, process.version)
console.log(`${getTimestamp()} 💻 Platform:`, process.platform)
console.log(`${getTimestamp()} 🌍 Environment:`, process.env.NODE_ENV || 'development')

const examplesSrc = path.resolve('/workspace/openjscad/packages/web/examples')
console.log(`${getTimestamp()} 📁 Examples source directory:`, examplesSrc)

// Add base directory constant
const baseDir = '/workspace/openjscad/packages/web'
console.log(`${getTimestamp()} 📁 Base directory:`, baseDir)

// Add this near the top of the file with other constants
const knownFiles = new Set();

// Copy favicon if it doesn't exist
const faviconPath = path.join(baseDir, 'favicon.ico')
if (!fs.existsSync(faviconPath)) {
  try {
    fs.copyFileSync(path.join(baseDir, 'images', 'favicon.ico'), faviconPath)
    console.log(`${getTimestamp()} 🎨 Copied favicon.ico`)
  } catch (error) {
    console.warn(`${getTimestamp()} ⚠️ Could not copy favicon:`, error)
  }
}

// Update server configuration to include title and favicon
const server = budo('/workspace/openjscad/packages/web/demo.js', {
  live: {
    reload: false
  },
  stream: process.stdout,
  watchGlob: ['examples/**/*.{js,html,css}', 'devserver.js', 'demo.css'],
  port: 8081,
  dir: baseDir,
  serve: 'demo.js',
  css: './css/demo.css',
  title: 'JSCAD Editor', // Add custom title
  staticOptions: {
    // Configure proper MIME types
    setHeaders: function (res, path) {
      if (path.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css')
      }
    }
  },
  middleware: [
    // Add middleware to inject favicon
    (req, res, next) => {
      if (req.url === '/favicon.ico') {
        res.setHeader('Content-Type', 'image/x-icon');
        fs.createReadStream(path.join(baseDir, 'favicon.ico')).pipe(res);
      } else {
        next();
      }
    }
  ]
})

// Handle server events
server.on('connect', function (ev) {
  console.log(`${getTimestamp()} ✅ Server started on port:`, ev.port)
  processExamples()
})

server.on('watch', function (ev, file) {
  console.log(`${getTimestamp()} 🔍 Watching event:`, ev, 'file:', file)
  // Your custom logic here
  if (shouldReload(file)) {
    server.reload()  // Manually trigger reload
  } else {
    console.log(`${getTimestamp()} ⏭️ Skipping reload for:`, file)
  }
})

server.on('reload', function () {
  console.log(`${getTimestamp()} 🔄 Server reloaded, processing examples...`)
  processExamples()
})

function processExamples() {
  console.log(`${getTimestamp()} 🚀 Starting examples processing...`)
  const examples = { 'Working Files': [], Other: [] }
  const examplesDist = 'examples'
  try {
    processExamplesInDirectory(examplesDist, examples)
  } catch (error) {
    console.error(`${getTimestamp()} ❌ Error processing examples:`, error)
  }
  console.log(`${getTimestamp()} 💾 Writing examples.json...`)
  fs.writeFile(examplesSrc + '/examples.json', JSON.stringify(examples), (err) => {
    if (err) {
      console.error(`${getTimestamp()} ❌ Error writing examples.json:`, err)
      return
    }
    console.log(`${getTimestamp()} ✅ Successfully wrote examples.json`)
  })
}

function processExamplesInDirectory(dir, examples) {
  // Skip hidden directories (starting with .)

  if (path.basename(dir).startsWith('.')) {
    console.log(`${getTimestamp()} ⏭️ Skipping hidden directory: ${dir}`)
    return
  }
  console.log(`${getTimestamp()} 📂 Processing directory:`, dir)

  const files = fs.readdirSync(dir)
  console.log(`${getTimestamp()} 📑 Found ${files.length} files in directory`)

  files.forEach((fileName) => {
    const filePath = path.join(dir, fileName)
    if (fs.lstatSync(filePath).isDirectory()) {
      console.log(`${getTimestamp()} 📁 Found subdirectory: ${fileName}`)
      processExamplesInDirectory(filePath, examples)
    } else if (filePath.endsWith('.js')) {
      console.log(`${getTimestamp()} 📄 Processing JS file: ${fileName}`)
      processExamplesFile(filePath, examples)
    } else {
      console.log(`${getTimestamp()} ⏭️ Skipping non-JS file: ${fileName}`)
    }
  })
}

// Modify the processExamplesFile function to track files
function processExamplesFile(filePath, examples) {
  console.log(`${getTimestamp()} 📝 Processing file:`, filePath)
  const title = filePath.split('/').pop()
  const description = filePath
  examples['Working Files'].push({ title, filePath, description })
  // Add file to known files set
  knownFiles.add(filePath)
}

// Implement the shouldReload function
function shouldReload(filePath) {
  // If this is a new file we haven't seen before, return true
  if (!knownFiles.has(filePath)) {
    console.log(`${getTimestamp()} 🆕 New file detected: ${filePath}`)
    return true;
  }
  console.log(`${getTimestamp()} ♻️ Existing file modified: ${filePath}`)
  return false;
}

processExamples()