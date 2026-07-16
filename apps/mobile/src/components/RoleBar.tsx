import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, radii } from '../constants/theme';
import { ROLE_LABELS, ROLE_ICONS } from '../services/auth';

// Color per role for the bar background
const ROLE_BAR_COLORS: Record<string, string> = {
  admin: '#EEEDFE',
  director: '#EEEDFE',
  tournament_director: '#EEEDFE',
  organization: '#FAEEDA',
  coach: '#E6F1FB',
  manager: '#E6F1FB',
  parent: '#EAF3DE',
  scorekeeper: '#EAF3DE',
  referee: '#E6F1FB',
};

const ROLE_BAR_TEXT_COLORS: Record<string, string> = {
  admin: '#534AB7',
  director: '#534AB7',
  tournament_director: '#534AB7',
  organization: '#854F0B',
  coach: '#185FA5',
  manager: '#185FA5',
  parent: '#3B6D11',
  scorekeeper: '#3B6D11',
  referee: '#185FA5',
};

// Short display labels
const SHORT_LABELS: Record<string, string> = {
  admin: 'Admin',
  director: 'Director',
  tournament_director: 'Director',
  organization: 'Organization',
  coach: 'Coach',
  manager: 'Manager',
  parent: 'Fan / Parent',
  scorekeeper: 'Scorekeeper',
  referee: 'Referee',
};

interface RoleBarProps {
  activeRole: string;
  userRoles: string[];
  onSwitchRole: (role: string) => void;
  onAddRole?: () => void;
}

export default function RoleBar({ activeRole, userRoles, onSwitchRole, onAddRole }: RoleBarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Don't render if user has only 1 role (or none)
  if (userRoles.length <= 1) return null;

  const barColor = ROLE_BAR_COLORS[activeRole] || '#E6F1FB';
  const textColor = ROLE_BAR_TEXT_COLORS[activeRole] || '#185FA5';
  const label = SHORT_LABELS[activeRole] || activeRole;
  const iconName = ROLE_ICONS[activeRole] || 'person';

  function handleSelect(role: string) {
    setDropdownOpen(false);
    if (role !== activeRole) {
      onSwitchRole(role);
    }
  }

  return (
    <>
      <TouchableOpacity
        style={[styles.bar, { backgroundColor: barColor }]}
        onPress={() => setDropdownOpen(true)}
        activeOpacity={0.7}
      >
        <View style={styles.barLeft}>
          <Ionicons name={iconName as any} size={16} color={textColor} />
          <Text style={[styles.barText, { color: textColor }]}>
            Currently viewing as <Text style={styles.barTextBold}>{label}</Text>
          </Text>
        </View>
        <View style={styles.barRight}>
          <Text style={[styles.switchText, { color: textColor }]}>Switch</Text>
          <Ionicons name="chevron-down" size={14} color={textColor} />
        </View>
      </TouchableOpacity>

      {/* Role Dropdown Modal */}
      <Modal
        visible={dropdownOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDropdownOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setDropdownOpen(false)}>
          <View style={styles.dropdown}>
            <Text style={styles.dropdownTitle}>Switch role</Text>
            {userRoles.map((role) => {
              const isActive = role === activeRole;
              const roleLabel = SHORT_LABELS[role] || role;
              const roleIcon = ROLE_ICONS[role] || 'person';
              return (
                <TouchableOpacity
                  key={role}
                  style={[styles.dropdownItem, isActive && styles.dropdownItemActive]}
                  onPress={() => handleSelect(role)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={roleIcon as any}
                    size={18}
                    color={isActive ? '#185FA5' : colors.text}
                  />
                  <Text style={[
                    styles.dropdownItemText,
                    isActive && styles.dropdownItemTextActive,
                  ]}>
                    {roleLabel}
                  </Text>
                  {isActive && (
                    <Ionicons name="checkmark" size={18} color="#185FA5" style={{ marginLeft: 'auto' }} />
                  )}
                </TouchableOpacity>
              );
            })}

            <View style={styles.dropdownDivider} />

            <TouchableOpacity
              style={styles.dropdownItem}
              onPress={() => {
                setDropdownOpen(false);
                if (onAddRole) onAddRole();
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="add-circle-outline" size={18} color={colors.cyan} />
              <Text style={[styles.dropdownItemText, { color: colors.cyan }]}>
                Add a role
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
  },
  barLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  barText: {
    fontSize: 13,
    fontWeight: '400',
  },
  barTextBold: {
    fontWeight: '700',
  },
  barRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  switchText: {
    fontSize: 13,
    fontWeight: '600',
  },
  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-start',
    paddingTop: 120,
    paddingHorizontal: 40,
  },
  dropdown: {
    backgroundColor: '#fff',
    borderRadius: radii.md,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  dropdownTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: radii.xs,
  },
  dropdownItemActive: {
    backgroundColor: '#E6F1FB',
  },
  dropdownItemText: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '500',
  },
  dropdownItemTextActive: {
    color: '#185FA5',
    fontWeight: '600',
  },
  dropdownDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: 8,
  },
});
