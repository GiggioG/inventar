const fs = require("fs");
const http = require("http");
const url = require("url");
const qs = require("querystring");
let ItemProto = {
    sayLocation: function() {
        return (this.parent ? (this.parent.sayLocation() + " > ") : "") + this.name;
    },
    search: function(type, search) {
        if (type == "id" && this.id == search) { return [this]; }
        let ret = [];
        if (type == "name" && this.name.includes(search)) { ret = [this]; }
        if (type == "description" && this.description.includes(search)) { ret = [this]; }
        return ret.concat(this.children.reduce((p, c) => { return p.concat(c.search(type, search)) }, []));
    }
}

function setup(obj) {
    obj.__proto__ = ItemProto;
    if (obj.children.length > 0) {
        for (c in obj.children) {
            obj.children[c].parent = obj;
            setup(obj.children[c]);
        }
    }
}

function setupOneItem(item, parent) {
    item.__proto__ = ItemProto;
    item.parent = parent;
}

if (!fs.existsSync("db.json")) {
    fs.writeFileSync("db.json", JSON.stringify({
        lastId: 1,
        root: {
            "name": "Начална страница",
            "description": "Тук се съдържат всичките ви локации",
            "id": 1,
            "parent": null,
            "currentLocation": null,
            "children": []
        }
    }));
}
let db = JSON.parse(fs.readFileSync("./db.json", "utf-8"));
setup(db.root);

function saveDB() {
    let cleanDB = Object.assign({}, db);
    cleanDB.root.search("name", "").slice(1).forEach(e => { delete e.parent });
    fs.writeFileSync("db.json", JSON.stringify(cleanDB));
    db = JSON.parse(fs.readFileSync("./db.json", "utf-8"));
    setup(db.root);
}

function api_search(type, search, res) {
    search = search.toLowerCase();
    let results = db.root.search(type, search);
    if (results.length == 0) {
        res.end("null");
        return;
    }
    let ret = [];
    results.forEach(result => {
        let ret_item = {
            name: result.name,
            description: result.description,
            id: result.id,
            currentLocation: result.currentLocation,
            parent: null,
            children: []
        }
        if (result.parent) {
            ret_item.parent = {
                path: result.parent.sayLocation(),
                id: result.parent.id
            }
        }
        result.children.forEach(c => {
            ret_item.children.push({
                name: c.name,
                id: c.id
            })
        });
        ret.push(ret_item);
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(ret));
    return;
}

function api_add(name, description, parentId, currentLocation, res) {
    let parent = db.root.search("id", parentId)[0];
    if (!parent) {
        res.writeHead(404);
        res.end(`Няма елемент с №${parentId}`);
        return;
    }
    let item = {
        name,
        description,
        id: db.lastId + 1,
        currentLocation: (currentLocation == "" ? null : currentLocation),
        children: []
    };
    db.lastId++;
    setupOneItem(item, parent);
    parent.children.push(item);
    saveDB();
    res.writeHead(201);
    res.end(`${item.id}`);
}

function api(req, res) {
    let parsed = url.parse(req.url);
    let endpoint = parsed.pathname.slice(5);
    let query = qs.parse(parsed.query);
    if (endpoint == "search") {
        api_search(Object.keys(query)[0], query[Object.keys(query)[0]], res);
        return;
    }
    if (req.method == "POST" && endpoint == "add") {
        if (req.socket.remoteAddress != "::ffff:192.168.0.105") {
            res.writeHead(400);
            res.end("nedej ma");
            return;
        }
        api_add(query.name, query.description, query.parentId, query.currentLocation, res);
        return;
    }
}
http.createServer((req, res) => {
    if (req.url.startsWith("/api/")) {
        api(req, res);
        return;
    } else if (req.url == "/search") {
        fs.createReadStream("search.html").pipe(res);
    } else if (req.url == "/search.png") {
        fs.createReadStream("search.png").pipe(res);
    } else {
        fs.createReadStream("item.html").pipe(res);
    }
}).listen(8080);
console.log("running on port 8080...");