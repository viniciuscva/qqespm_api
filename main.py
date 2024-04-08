from flask import Flask, render_template, request, url_for, jsonify
import folium
import json
import qqespm_module as qq


app = Flask(__name__)

# https://www.youtube.com/watch?v=K2ejI4z8Mbg

# export FLASK_APP=main.py
# flask run
# export FLASK_ENV=development
# export FLASK_ENV=production
# Do not enable debug mode when deploying in production.
# flask --app example --debug run
# export FLASK_DEBUG=1
# set FLASK_DEBUG=1 (for windows)
# export FLASK_DEBUG=false
# export FLASK_DEBUG=true


# criar as páginas do site
# cada página tem:
# route
# função
# template

app = Flask(__name__)



@app.route('/')
def home():
    return render_template('index.html')

@app.route('/map')
def map():
    return render_template('map.html')

@app.route('/search', methods = ['POST'])
def call_qqespm():
    req_data = request.get_json()
    method = req_data['method']
    spatial_pattern_json = req_data['spatial_pattern']
    print('method selected:', method)
    print('spatial pattern selected:', spatial_pattern_json)
    sp = qq.SpatialPatternGraph.from_json(spatial_pattern_json)
    solutions, elapsed_time, memory_usage = qq.QQESPM(sp, debug = True)
    print('Total solutions:', len(solutions))
    print('Elapsed time:', elapsed_time)
    print('Memory usage:', memory_usage)
    solutions_json = qq.solutions_to_json(solutions[:10], indent=2, only_ids = False)
    return jsonify({'solutions': solutions_json})


if __name__ == '__main__':
    app.run(debug=True)
