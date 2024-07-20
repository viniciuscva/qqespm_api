
let sp = `
{
    "vertices": [
      {
        "id": 0,
        "keyword": "school"
      },
      {
        "id": 1,
        "keyword": "bakery"
      },
      {
        "id": 2,
        "keyword": "restaurant"
      }
    ],
    "edges": [
      {
        "id": "0-1",
        "vi": 0,
        "vj": 1,
        "lij": 100,
        "uij": 1000,
        "sign": ">",
        "relation": null
      },
      {
        "id": "1-2",
        "vi": 1,
        "vj": 2,
        "lij": 356,
        "uij": 2918,
        "sign": "<>",
        "relation": null
      }
    ]
}
`

sp = '{"vertices": [{"id": 0, "keyword": "school"}, {"id": 1, "keyword": "bakery"}, {"id": 2, "keyword": "restaurant"}], "edges": [{"id": "0-1", "vi": 0, "vj": 1, "lij": 0, "uij": 1000, "sign": "-", "relation": null}, {"id": "1-2", "vi": 1, "vj": 2, "lij": 356, "uij": 2918, "sign": ">", "relation": null}]}'

fetch("http://127.0.0.1:5000/search", {
    method: "POST",
    body: JSON.stringify({'method': 'qqespm', 'spatial_pattern': sp}),
    headers: {
        "Content-type": "application/json; charset=UTF-8"
    }
    }).then(res => res.json())
    .then(data => data['solutions'])
    .then(text => console.log(text))



curl -X POST -H "Content-Type: application/json" \
-d '{
  "method": "qqespm",
  "spatial_pattern": {
    "vertices": [
      {"id": 0, "keyword": "school"},
      {"id": 1, "keyword": "bakery"},
      {"id": 2, "keyword": "restaurant"}
    ],
    "edges": [
      {"id": "0-1", "vi": 0, "vj": 1, "lij": 0, "uij": 1000, "sign": "-", "relation": null},
      {"id": "1-2", "vi": 1, "vj": 2, "lij": 356, "uij": 2918, "sign": ">", "relation": null}
    ]
  }
}' \
http://127.0.0.1:5000/search
    

