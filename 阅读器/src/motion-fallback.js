/* 迷你动效引擎：构建时若未取得 GSAP，用它提供等价基础能力（仅 transform/opacity） */
(function (win) {
  if (win.gsap) return;
  var reduced = win.matchMedia && win.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function now() { return (win.performance && win.performance.now) ? win.performance.now() : Date.now(); }
  function setVars(node, obj) {
    var st = node.style;
    for (var k in obj) {
      if (k === "opacity") { st.opacity = obj[k]; continue; }
      if (k === "x") { st.transform = "translate3d(" + obj.x + "px,0,0)"; continue; }
      if (k === "y") { st.transform = "translate3d(0," + obj.y + "px,0)"; continue; }
      if (k === "scaleX") { st.transform = "scaleX(" + obj.scaleX + ")"; continue; }
      if (k === "scale") { st.transform = "scale(" + obj.scale + ")"; continue; }
    }
  }
  win.gsap = {
    version: "motion-fallback",
    set: function (node, obj) { setVars(node, obj); },
    quickSetter: function (node, prop) {
      return function (v) {
        var o = {}; o[prop] = v; setVars(node, o);
      };
    },
    fromTo: function (node, from, to) {
      var dur = to.duration || 0.4;
      setVars(node, from);
      if (reduced) { setTimeout(function () { setVars(node, to); }, 0); return { kill: function () {} }; }
      var t0 = now();
      var ease = win.gsap.easeOutCubic;
      var id = win.setInterval(function () {
        var p = Math.min(1, (now() - t0) / (dur * 1000));
        var e = ease(p);
        var o = {};
        for (var k in to) {
          if (k === "duration" || k === "ease" || k === "delay" || k === "stagger" || k === "onComplete") continue;
          o[k] = (typeof from[k] === "number" && typeof to[k] === "number") ? from[k] + (to[k] - from[k]) * e : to[k];
        }
        setVars(node, o);
        if (p >= 1) { win.clearInterval(id); if (to.onComplete) to.onComplete(); }
      }, 16);
      return { kill: function () { win.clearInterval(id); } };
    },
    easeOutCubic: function (t) { return 1 - Math.pow(1 - t, 3); },
    easeOutExpo: function (t) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); },
    timeline: function () {
      var steps = [];
      var self = {
        fromTo: function (node, from, to, pos) {
          var t = 0; var last = steps[steps.length - 1];
          if (pos === "<") t = last ? last.at + last.dur : 0;
          else t = last ? last.at + last.dur : 0;
          steps.push({ node: node, from: from, to: to, at: t, dur: (to.duration || 0.4) * 1000 });
          return self;
        },
        play: function () {
          if (reduced) { steps.forEach(function (s) { setVars(s.node, s.to); }); return; }
          var t0 = now();
          var id = win.setInterval(function () {
            var elapsed = now() - t0; var done = true;
            steps.forEach(function (s) {
              var local = Math.max(0, Math.min(1, (elapsed - s.at) / s.dur));
              if (local < 1) done = false;
              var e = win.gsap.easeOutCubic(local), o = {};
              for (var k in s.to) {
                if (k === "duration" || k === "ease" || k === "delay" || k === "onComplete") continue;
                o[k] = (typeof s.from[k] === "number" && typeof s.to[k] === "number") ? s.from[k] + (s.to[k] - s.from[k]) * e : s.to[k];
              }
              setVars(s.node, o);
            });
            if (done) win.clearInterval(id);
          }, 16);
        }
      };
      return self;
    }
  };
  Object.defineProperty(win, "gsapFallback", { value: true });
})(window);
