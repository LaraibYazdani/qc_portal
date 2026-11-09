import { parseDesignFilename, isUsualJobNumber } from '../jobNumber';

describe('isUsualJobNumber', () => {
  it.each(['267N2943', '26ON4465', '23DN2312', '20NN2354', '2670699', '16D0443', '14O0324', '2959977-1', ' 23dn2332 '])(
    'accepts %s', s => expect(isUsualJobNumber(s)).toBe(true));
  it.each(['NIKE', '12345', 'TESTBULK001', '241N195', '252N02541', '243N0615 -40177461MO', '266N2440_', '436202'])(
    'flags %s', s => expect(isUsualJobNumber(s)).toBe(false));
});

describe('parseDesignFilename (file names from phase 1 uploads)', () => {
  it('splits at the first underscore, as the convention says', () => {
    expect(parseDesignFilename('267N2943_GMSAHOTMELTGLU_C[18].jpg'))
      .toEqual({ jobNumber: '267N2943', designName: 'GMSAHOTMELTGLU_C[18]', unusual: false });
  });

  it('upper-cases and trims the job number', () => {
    expect(parseDesignFilename('23dn2332 _MaxFresh125g_C.jpg').jobNumber).toBe('23DN2332');
  });

  it('keeps a part suffix', () => {
    expect(parseDesignFilename('2959977-1_LALindustries977-1_C.jpg').jobNumber).toBe('2959977-1');
  });

  it('finds the job number behind another code and keeps the code in the design name', () => {
    const p = parseDesignFilename('434814_2690952_Glasses&PhoneCase_C3_002.jpg');
    expect(p).toMatchObject({ jobNumber: '2690952', designName: '434814_Glasses&PhoneCase_C3_002', unusual: false });
    expect(p.note).toMatch(/part 2/);
  });

  it('flags extra text after the job number and suggests the fix', () => {
    const p = parseDesignFilename('243N0615 -40177461MO_Shipping Case Watermelon Mint LEPP_PAK_C.jpg');
    expect(p.unusual).toBe(true);
    expect(p.note).toMatch(/Did you mean 243N0615/);
  });

  it('flags names that are not job numbers', () => {
    expect(parseDesignFilename('NIKE_Carton box_BSP.jpg')).toMatchObject({ jobNumber: 'NIKE', unusual: true });
    expect(parseDesignFilename('PAYPER_CWC.jpg')).toMatchObject({ jobNumber: 'PAYPER', unusual: true });
  });

  it('refuses a file name without an underscore', () => {
    expect(parseDesignFilename('267N2943.jpg').error).toBeDefined();
    expect(parseDesignFilename('_ShipperType59_CWC[3].jpg').error).toBeDefined();
  });
});
