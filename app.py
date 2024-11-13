import os
from flask import Flask, request, jsonify, render_template, url_for
from werkzeug.utils import secure_filename
from datetime import datetime

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'static/uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Ensure upload folder exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Create audio uploads folder
os.makedirs('static/audio_uploads', exist_ok=True)

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif'}
ALLOWED_AUDIO_EXTENSIONS = {'m4a', 'mp3', 'wav'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'image' not in request.files:
        return jsonify({'success': False, 'error': 'No file part'})
    
    file = request.files['image']
    if file.filename == '':
        return jsonify({'success': False, 'error': 'No selected file'})
    
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        return jsonify({
            'success': True,
            'image_url': url_for('static', filename=f'uploads/{filename}')
        })
    
    return jsonify({'success': False, 'error': 'Invalid file type'})

@app.route('/upload_audio', methods=['POST'])
def upload_audio():
    if 'audio' not in request.files:
        return jsonify({'success': False, 'error': 'No file part'})
    
    file = request.files['audio']
    name = request.form.get('name', '')
    
    if file.filename == '':
        return jsonify({'success': False, 'error': 'No selected file'})
    
    filename = f"{name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.m4a"
    filepath = os.path.join('static/audio_uploads', secure_filename(filename))
    file.save(filepath)
    
    return jsonify({
        'success': True,
        'audio_url': url_for('static', filename=f'audio_uploads/{filename}')
    })

if __name__ == '__main__':
    app.run(
        debug=True, 
        host='0.0.0.0', 
        port=5000,
        ssl_context=('ssl/cert.pem', 'ssl/key.pem')
    )