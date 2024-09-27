const express = require("express");
const app = express();
const mongoose = require("mongoose");
const cForm = require("./models/cForm.js");
const Customer = require("./models/Customer.js"); // Import your Customer model
const Tailor = require("./models/Tailor.js");
const path = require("path");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const session = require('express-session');

const MONGOURL = "mongodb://127.0.0.1:27017/naap-jhok";

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.engine("ejs", ejsMate);
app.use(express.static(path.join(__dirname, "/public")));

// Middleware for sessions
app.use(session({
    secret: 'yourSecretKey', // Replace with your own secret key
    resave: false,
    saveUninitialized: true,
}));

// Middleware to attach customer info to res.locals
app.use(async (req, res, next) => {
    if (req.session && req.session.customerId) {
        const customer = await Customer.findById(req.session.customerId);
        if (customer) {
            res.locals.customerName = customer.name; // Attach the customer's name to res.locals
        }
    }
    next(); // Call the next middleware or route handler
});

// MongoDB connection
main()
    .then(() => {
        console.log("MongoDB is connected");
        app.listen(8080, () => {
            console.log("Server is running on port 8080");
        });
    })
    .catch((err) => {
        console.error(err);
    });

async function main() {
    try {
        await mongoose.connect(MONGOURL, {});
    } catch (err) {
        console.error(err);
        process.exit(1); // Exit the process if MongoDB connection fails
    }
}

// Home Route
app.get('/', (req, res) => {
    console.log("Session Data:", req.session); // Log the session data
    const customerName = req.session.customerName || null; // Retrieve customerName from session
    res.render('listings/index', { customerName });
});

// Customer Login Route
app.get("/login/customer", (req, res) => {
    res.render("listings/customerLogin.ejs"); // Render customer login page
});

app.post('/login/customer', async (req, res) => {
    const { identifier, password } = req.body;

    try {
        const customer = await Customer.findOne({
            $or: [{ email: identifier }, { phone: identifier }]
        });

        if (customer && customer.password === password) {
            // Set session data
            req.session.customerId = customer._id;
            req.session.customerName = customer.name; // Make sure customer.name exists

            // Redirect to the home page after login
            res.redirect('/');
        } else {
            res.send('Invalid credentials');
        }
    } catch (err) {
        console.error(err);
        res.send('An error occurred');
    }
});

// Customer Dashboard Route (Unique for each customer based on their MongoDB ID)
app.get("/dashboard/:id", async (req, res) => {
    try {
        // Fetch customer data based on the MongoDB ID
        const customer = await Customer.findById(req.params.id);

        // If customer is found, render the dashboard with customer data
        if (customer) {
            res.render("listings/dashboard.ejs", { customer });
        } else {
            res.status(404).send("Customer not found");
        }
    } catch (error) {
        res.status(500).send("Error fetching customer data");
    }
});

// Handle form submission for placing new orders
app.post("/orders/new", async (req, res) => {
    const { item, quantity } = req.body;

    // Find the customer and add the new order
    await Customer.findByIdAndUpdate(req.user._id, {
        $push: {
            orders: {
                items: [item],
                quantity,
                status: "Pending",
                total: calculateTotal(item, quantity), // Assume you have a function for calculating total
            },
        },
    });

    res.redirect(`/dashboard/${req.user._id}`);
});

// Tailor Login Route
app.get("/login/tailor", (req, res) => {
    res.render("auth/tailorLogin"); // Render tailor login page
});

// Route to render "Become a Tailor" form
app.get("/become-tailor", (req, res) => {
    res.render("listings/becometailor.ejs"); // Render the tailor form page
});

// Route to handle form submission and store tailor details in MongoDB
app.post("/become-tailor", async (req, res) => {
    const { name, email, phone, experience, expertise, location } = req.body;

    // Create a new Tailor document (You need to have a Tailor model created in models/Tailor.js)
    const newTailor = new Tailor({
        name,
        email,
        phone,
        experience,
        expertise,
        location
    });

    try {
        // Save the new tailor to MongoDB
        await newTailor.save();
        res.send("Tailor application submitted successfully!"); // You can redirect to a thank you page or tailor dashboard
    } catch (err) {
        res.status(500).send("Error submitting tailor application. Please try again later.");
    }
});

// Route for Tailor Dashboard
app.get("/tailor/dashboard", async (req, res) => {
    try {
        const customerForms = await cForm.find({}); // Fetch all customer forms from MongoDB
        res.render("listings/tDashboard.ejs", { customerForms }); // Pass the data to EJS template
    } catch (err) {
        console.error(err);
        res.status(500).send("Error fetching customer details");
    }
});

// Render the registration form
app.get("/register", (req, res) => {
    res.render("listings/register.ejs"); // Render the registration form
});

// Handle form submission for registration
app.post("/register", async (req, res) => {
    const { email, phone, password } = req.body;

    // Check if the user already exists
    const existingUser = await Customer.findOne({ email });
    if (existingUser) {
        return res.status(400).send("User already exists");
    }

    // Create new customer (no hashing of password)
    const newCustomer = new Customer({
        email,
        phone,
        password,
    });

    // Save customer to database
    await newCustomer.save();

    res.send("Account created successfully!");
});

// Mens Listing 
app.get('/services/mens', (req, res) => {
    res.render('listings/menItems.ejs');
});

// Logout Route
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.send('An error occurred while logging out');
        }
        res.redirect('/');
    });
});

// Middleware to parse JSON bodies
app.use(express.json());
