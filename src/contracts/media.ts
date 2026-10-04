/** Upload response shared by browser controls and pure asset-library helpers. */
export interface UploadResult {
  id:string;
  filename:string;
  variants:Record<string,string>;
  capturedAt?:string;
  gps?:{lnglat:[number,number]};
  warnings:string[];
  suggestedLocation?:{lnglat:[number,number];address:string;source:'exif'};
}
