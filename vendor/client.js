(function(global){
  const EVENTS = new Set(['LOG','PROGRESS']);
  class LocalFFmpeg {
    constructor(workerURL='./vendor/814.ffmpeg.js'){
      this.worker = new Worker(workerURL);
      this.nextId = 1;
      this.pending = new Map();
      this.listeners = { LOG: new Set(), PROGRESS: new Set() };
      this.loaded = false;
      this.worker.onmessage = ({data}) => {
        const {id,type,data:payload} = data || {};
        if (EVENTS.has(type)) {
          for (const fn of this.listeners[type]) {
            try { fn(payload); } catch (error) { console.error(error); }
          }
          return;
        }
        const pending = this.pending.get(id);
        if (!pending) return;
        this.pending.delete(id);
        if (type === 'ERROR') pending.reject(new Error(String(payload)));
        else {
          if (type === 'LOAD') this.loaded = true;
          pending.resolve(payload);
        }
      };
      this.worker.onerror = (event) => {
        const error = new Error(event.message || 'FFmpeg worker error');
        for (const {reject} of this.pending.values()) reject(error);
        this.pending.clear();
      };
    }
    on(type, listener){
      const key = String(type).toUpperCase();
      if (this.listeners[key]) this.listeners[key].add(listener);
    }
    off(type, listener){
      const key = String(type).toUpperCase();
      if (this.listeners[key]) this.listeners[key].delete(listener);
    }
    request(type, data, transfer=[]){
      return new Promise((resolve, reject) => {
        const id = this.nextId++;
        this.pending.set(id, {resolve, reject});
        try { this.worker.postMessage({id, type, data}, transfer); }
        catch (error) { this.pending.delete(id); reject(error); }
      });
    }
    load(config){ return this.request('LOAD', config); }
    exec(args, timeout=-1){ return this.request('EXEC', {args, timeout}); }
    writeFile(path, data){
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
      return this.request('WRITE_FILE', {path, data:bytes}, [bytes.buffer]);
    }
    readFile(path, encoding='binary'){ return this.request('READ_FILE', {path, encoding}); }
    deleteFile(path){ return this.request('DELETE_FILE', {path}); }
    terminate(){
      this.worker.terminate();
      this.loaded = false;
      for (const {reject} of this.pending.values()) reject(new Error('FFmpeg terminated'));
      this.pending.clear();
    }
  }
  global.LocalFFmpeg = LocalFFmpeg;
})(window);