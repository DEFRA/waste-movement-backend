export const apiCode1 = '25b14080-5e77-4f91-9957-2482a0cb8775'
export const apiCode2 = 'bc05d1ce-5a80-4624-b2ae-e7227c8c6c41'
export const orgId1 = '57aed195-325e-45d5-b1fb-5f201e0324cf'
export const orgId2 = '70d84972-2ad3-4ada-a867-ad261a7245e7'

export const orgApiCodes = [
  {
    apiCode: apiCode1,
    orgId: orgId1
  },
  {
    apiCode: apiCode2,
    orgId: orgId2
  }
]

export const base64EncodedOrgApiCodes = btoa(
  `${apiCode1}=${orgId1},${apiCode2}=${orgId2}`
)
