export type UserRole = 'admin' | 'team_lead' | 'counter' | 'reviewer' | 'manager';

export type AssetMethod = 'Count' | 'Inspect' | 'Vehicle' | 'Document';

export type VerificationResult = 
  | 'Verified'
  | 'Verified - Condition Issue'
  | 'Verified - Tag Issue'
  | 'Qty Short'
  | 'Qty Excess'
  | 'Not Found'
  | 'Not Accessible'
  | 'Pending';

export type TagStatus = 
  | 'Tag OK'
  | 'Tag Damaged/Unreadable'
  | 'Tag Missing - identified by serial'
  | 'Tag Missing - identified by description'
  | 'Re-tagged';

export type AssetCondition = 
  | 'Good'
  | 'Fair'
  | 'Poor'
  | 'Damaged'
  | 'Idle'
  | 'Not Working';

export interface Engagement {
  id: string;
  client_name: string;
  financial_year: string;
  far_cutoff_date: string;
  count_start_date?: string;
  count_end_date?: string;
  status: 'draft' | 'active' | 'locked' | 'closed';
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  id: string;
  email?: string;
  full_name: string;
  role: UserRole;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Location {
  id: string;
  engagement_id?: string;
  building: string;
  floor: string;
  room: string;
  assigned_counter?: string;
  status: 'open' | 'closed' | 'signed_off';
  areas_not_accessed?: string;
  unaccessed_reason?: string;
  client_rep_name?: string;
  client_rep_designation?: string;
  client_signature?: string;
  signed_off_at?: string;
  created_at: string;
  updated_at: string;
}

// Master Asset (Keyed on tag_no PK = 8-digit SAP number)
export interface Asset {
  tag_no: string; // Primary Key
  engagement_id?: string;
  description: string;
  asset_class: string;
  gl_account?: string;
  capitalized_on?: string;
  cost: number;       // SENSITIVE: Hidden from counters
  acc_dep: number;    // SENSITIVE: Hidden from counters
  nbv: number;        // SENSITIVE: Hidden from counters
  far_qty: number;
  method: AssetMethod;
  created_at: string;
  updated_at: string;
}

// Counter's restricted asset view (Cost, Acc Dep, and NBV completely excluded)
export interface AssetCounterView {
  tag_no: string;
  engagement_id?: string;
  description: string;
  asset_class: string;
  gl_account?: string;
  capitalized_on?: string;
  far_qty: number;
  method: AssetMethod;
  created_at: string;
  updated_at: string;
}

export interface Verification {
  id: string;
  engagement_id?: string;
  tag_no: string;
  found?: 'Yes' | 'No' | 'Not Accessible';
  count_date: string;
  counter_id?: string;
  location_id?: string;
  department?: string;
  custodian?: string;
  tag_status: string;
  serial_no?: string;
  brand_model?: string;
  physical_qty: number;
  condition: string;
  in_use: boolean;
  remarks?: string;
  result: VerificationResult | string;
  review_status: 'pending' | 'approved' | 'sent_back';
  gps_lat?: number;
  gps_lng?: number;
  gps_accuracy?: number;
  created_at: string;
  updated_at: string;
}

export interface Photo {
  id: string;
  verification_id: string;
  file_path: string;
  file_hash?: string;
  photo_type: 'asset' | 'tag' | 'damage' | 'general';
  taken_at: string;
  gps_lat?: number;
  gps_lng?: number;
  created_at: string;
}

export interface FoundNotInFAR {
  id: string;
  engagement_id?: string;
  location_id?: string;
  tag_found?: string;
  description: string;
  brand_model?: string;
  serial_no?: string;
  probable_class?: string;
  qty: number;
  condition: string;
  in_use: boolean;
  photo_path?: string;
  client_explanation?: string;
  resolution?: string;
  logged_by?: string;
  created_at: string;
  updated_at: string;
}

export interface Movement {
  id: string;
  engagement_id?: string;
  tag_no: string;
  from_location_id?: string;
  to_location_id?: string;
  issue_date?: string;
  receive_date?: string;
  qty: number;
  status: 'In Transit' | 'Received' | 'Returned';
  gate_pass_no?: string;
  authorized_by?: string;
  remarks?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface DocCheck {
  id: string;
  engagement_id?: string;
  tag_no: string;
  check_type: string;
  document_ref?: string;
  check_date: string;
  progress_pct?: number;
  remarks?: string;
  checked_by?: string;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  entity: string;
  record_id: string;
  field: string;
  old_value?: string;
  new_value?: string;
  reason?: string;
  changed_by?: string;
  changed_at: string;
}
