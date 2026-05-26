pub const ID_LENGTH: usize = 22;

pub fn new_id() -> String {
    nanoid::nanoid!(ID_LENGTH)
}
