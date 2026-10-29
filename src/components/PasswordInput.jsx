import { useState } from 'react';

// Password field with a show/hide button and a Caps Lock warning.
export function PasswordInput(props) {
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const checkCaps = (e) => setCaps(e.getModifierState?.('CapsLock') ?? false);
  return (
    <>
      <div className="pwrow">
        <input {...props} type={show ? 'text' : 'password'} onKeyDown={checkCaps} onKeyUp={checkCaps} onBlur={() => setCaps(false)} style={{ flex: 1 }} />
        <button type="button" className="btn icon" style={{ marginBottom: 10 }} onClick={() => setShow(!show)} title={show ? 'Sembunyikan' : 'Lihat'} aria-label={show ? 'Sembunyikan password' : 'Lihat password'}>
          <i className={`ti ti-eye${show ? '-off' : ''}`} />
        </button>
      </div>
      {caps && <div className="caps"><i className="ti ti-arrow-big-up-line" />Caps Lock menyala</div>}
    </>
  );
}
