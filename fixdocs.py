import re, glob
def edit(p, pairs):
    s = open(p, encoding='utf-8').read()
    for a, b in pairs:
        assert s.count(a) == 1, (p, a); s = s.replace(a, b)
    open(p, 'w', encoding='utf-8').write(s)
edit('specs/022-speak-whole-sentences/spec.md', [
 ("Since spec 034 each utterance", "Since spec 038 each utterance"),
 ("into clips rendered by Microsoft's online voices", "into clips rendered by Piper on this PC"),
 ("clips rendered ahead (spec 034)", "clips rendered ahead (spec 038)"),
 ("Spec 034's shim", "Spec 038's shim"),
])
edit('specs/037-browser-echo-cancellation/spec.md', [
 ("""The Microsoft
online voices (the default, spec 034) play through WebAudio in Chrome, so they
are cancelled. A Windows system voice picked in settings, or the fallback when
an online clip fails, plays outside Chrome and is not cancelled.""",
  """Piper clips
(the default, spec 038) play through WebAudio in Chrome, so they are
cancelled. A Windows system voice picked in settings, or the fallback when a
Piper clip fails, plays outside Chrome and is not cancelled."""),
])
edit('src/stts_ui.html', [
 ("""which covers the Microsoft online voices
         (played through WebAudio)""", """which covers the Piper clips
         (played through WebAudio, spec 038)"""),
 ("""      // Spec 033: a system voice (localService, e.g. the Microsoft Online voices through
      // NaturalVoiceSAPIAdapter) gets the whole part as one utterance, because each
      // utterance is a new request to the voice service and every boundary is a long gap.
      // Chrome's own network voices (Google US English) still get one per sentence.""",
  """      // Spec 033: a picked Windows voice speaks the whole part as one utterance (every
      // utterance boundary is a gap). Otherwise one per sentence; the Piper shim cuts further."""),
])
edit('test/one-utterance.test.mjs', [
 ("(now each cut into clips by the spec 034 shim); guidance per spec 034", "(each cut into clips by the spec 038 Piper shim)"),
 ("(spec 034)", "(spec 038)"),
 ("""      assert.match(body, /localStorage\\.getItem('__stts__voice')/, f);""", """      assert.match(body, /localStorage\\.getItem\\('__stts__voice'\\) && v\\.localService/, f);"""),
])
