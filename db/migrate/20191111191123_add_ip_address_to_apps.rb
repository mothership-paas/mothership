class AddIpAddressToApps < ActiveRecord::Migration[6.0]
  def change
    add_column :apps, :ip_address, :string
  end
end
