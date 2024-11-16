const express = require("express");
const app = express();
const mongoose = require("mongoose");
const cForm = require("./models/cForm.js");
const Customer = require("./models/Customer.js");
const Tailor = require("./models/Tailor.js");
const Order = require("./models/Order.js");

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
app.use(session({ secret: 'mySecret', resave: false, saveUninitialized: true }));

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
            req.session.customerName = customer.name;

            // Fetch orders for the logged-in customer
            const orders = await Order.find({ customerId: customer._id });

            // Render the index page with customer info and their orders
            return res.render('listings/loginindex', { customerName: customer.name, orders });
        } else {
            res.render('auth/customerLogin', { error: 'Invalid credentials. Please try again.' });
        }
    } catch (err) {
        console.error(err);
        res.render('auth/customerLogin', { error: 'An error occurred. Please try again later.' });
    }
});

// Customer Dashboard Route (Unique for each customer based on their MongoDB ID)
app.get("/dashboard/:id", async (req, res) => {
    try {
        const customer = await Customer.findById(req.params.id);

        if (customer) {
            res.render("listings/dashboard.ejs", { customer });
        } else {
            res.status(404).send("Customer not found");
        }
    } catch (error) {
        res.status(500).send("Error fetching customer data");
    }
});

// Tailor Login Route
app.get("/login/tailor", (req, res) => {
    res.render("auth/tailorLogin"); // Render tailor login page
});

// Route to render "Become a Tailor" form
app.get("/become-tailor", (req, res) => {
    res.render("listings/becometailor.ejs"); // Render the tailor form page
});

app.post("/become-tailor", async (req, res) => {
    const { name, email, phone, experience, expertise, location } = req.body;

    const newTailor = new Tailor({
        name,
        email,
        phone,
        experience,
        expertise,
        location
    });

    try {
        await newTailor.save();
        res.send("Tailor application submitted successfully!");
    } catch (err) {
        res.status(500).send("Error submitting tailor application. Please try again later.");
    }
});

// Route for Tailor Dashboard
app.get("/tailor/dashboard", async (req, res) => {
    try {
        // Fetch all customer orders from the Order collection
        const customerForms = await Order.find({}); // Assuming orders are stored in the Order model

        // Check if data is found and render the template accordingly
        if (customerForms && customerForms.length > 0) {
            res.render("listings/tDashboard.ejs", { customerForms });
        } else {
            res.render("listings/tDashboard.ejs", { customerForms: [] }); // Pass an empty array if no data
        }
    } catch (err) {
        console.error("Error fetching customer details:", err);
        res.status(500).send("Error fetching customer details");
    }
});


// Render the registration form
app.get("/register", (req, res) => {
    res.render("listings/register.ejs"); // Render the registration form
});

app.post("/register", async (req, res) => {
    const { email, phone, password } = req.body;

    const existingUser = await Customer.findOne({ email });
    if (existingUser) {
        return res.status(400).send("User already exists");
    }

    const newCustomer = new Customer({
        email,
        phone,
        password,
    });

    await newCustomer.save();

    res.send("Account created successfully!");
});

// Mens Listing 
app.get('/services/mens', (req, res) => {
    res.render('listings/menItems.ejs');
});

// Womens Listing 
app.get('/services/womens', (req, res) => {
    res.render('listings/womenitems.ejs');
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

// Route to render the order placement form
app.get("/place-order", (req, res) => {
    res.render("listings/orderform.ejs", { orders: [] });
});

// Route to handle order submission
app.post("/place-order", async (req, res) => {
    const { name, email, phone, pincode, address } = req.body;

    // Create a new Order document
    const newOrder = new Order({
        name,
        email,
        phone,
        pincode,
        address,
        date: new Date()
    });

    try {
        // Save the new order to MongoDB
        await newOrder.save();

        // Redirect back to order form after submission
        res.redirect("/place-order");
    } catch (err) {
        res.status(500).send("Error placing order. Please try again later.");
    }
});

// My Orders Route
app.get('/my-orders', async (req, res) => {
    try {
        // Fetch orders without checking session
        const orders = await Order.find({});
        res.render('myOrders', { orders });
    } catch (err) {
        res.status(500).send("Error fetching orders. Please try again later.");
    }
});



module.exports = app;
