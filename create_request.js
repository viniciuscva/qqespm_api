
var sp = '{"vertices": {"0": "school", "1": "bakery", "2": "restaurant"}, "edges": {"0-1": {"vi": 0, "vj": 1, "lij": 0, "uij": 200, "sign": "-", "relation": null}, "1-2": {"vi": 1, "vj": 2, "lij": 200, "uij": 500, "sign": ">", "relation": null}}}'

fetch("http://127.0.0.1:5000/search", {
    method: "POST",
    body: JSON.stringify({'method': 'qqespm', 'spatial_pattern': sp}),
    headers: {
        "Content-type": "application/json; charset=UTF-8"
    }
    }).then(res => res.json())
    .then(data => data['solutions'])
    .then(text => console.log(text))